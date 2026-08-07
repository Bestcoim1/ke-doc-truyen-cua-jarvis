from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from .model import Paragraph, ParsedDocument


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = f"{{{W_NS}}}"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


def _on(element: ET.Element | None) -> bool:
    if element is None:
        return False
    value = element.get(W + "val", "true").casefold()
    return value not in {"0", "false", "off", "no"}


def _style_catalog(archive: ZipFile) -> dict[str, tuple[str, int | None]]:
    try:
        root = ET.fromstring(archive.read("word/styles.xml"))
    except KeyError:
        return {}
    result: dict[str, tuple[str, int | None]] = {}
    for style in root.findall(W + "style"):
        style_id = style.get(W + "styleId", "")
        name_element = style.find(W + "name")
        name = name_element.get(W + "val", style_id) if name_element is not None else style_id
        level: int | None = None
        ppr = style.find(W + "pPr")
        if ppr is not None:
            outline = ppr.find(W + "outlineLvl")
            if outline is not None:
                try:
                    level = int(outline.get(W + "val", "")) + 1
                except ValueError:
                    pass
        match = re.search(r"(?:heading|title|tiêu\s*đề)\s*([1-9])", f"{style_id} {name}", re.I)
        if match:
            level = int(match.group(1))
        result[style_id] = (name, level)
    return result


def _note_catalog(archive: ZipFile, member: str, tag: str) -> dict[str, str]:
    try:
        root = ET.fromstring(archive.read(member))
    except KeyError:
        return {}
    notes: dict[str, str] = {}
    for node in root.findall(W + tag):
        note_id = node.get(W + "id", "")
        if not note_id or note_id.startswith("-"):
            continue
        parts: list[str] = []
        for paragraph in node.iter(W + "p"):
            text = "".join(item.text or "" for item in paragraph.iter(W + "t")).strip()
            if text:
                parts.append(text)
        if parts:
            notes[note_id] = " ".join(parts)
    return notes


def _run_text(run: ET.Element) -> tuple[str, str, list[str], list[str], bool]:
    plain_parts: list[str] = []
    markdown_parts: list[str] = []
    footnotes: list[str] = []
    endnotes: list[str] = []
    page_break = False
    rpr = run.find(W + "rPr")
    bold = _on(rpr.find(W + "b")) if rpr is not None else False
    italic = _on(rpr.find(W + "i")) if rpr is not None else False
    for child in run:
        if child.tag in {W + "t", W + "delText"}:
            # Deleted runs are filtered by the caller. XML space is intentionally
            # respected by ElementTree through the original text value.
            value = child.text or ""
            plain_parts.append(value)
            markdown_parts.append(value)
        elif child.tag == W + "tab":
            plain_parts.append("\t")
            markdown_parts.append("\t")
        elif child.tag == W + "br":
            if child.get(W + "type") == "page":
                page_break = True
            else:
                plain_parts.append("\n")
                markdown_parts.append("<br>")
        elif child.tag == W + "footnoteReference":
            note_id = child.get(W + "id", "")
            if note_id:
                footnotes.append(note_id)
                plain_parts.append(f"[footnote {note_id}]")
                markdown_parts.append(f"[^fn-{note_id}]")
        elif child.tag == W + "endnoteReference":
            note_id = child.get(W + "id", "")
            if note_id:
                endnotes.append(note_id)
                plain_parts.append(f"[endnote {note_id}]")
                markdown_parts.append(f"[^en-{note_id}]")
    plain = "".join(plain_parts)
    markdown = "".join(markdown_parts)
    if markdown and bold and italic:
        markdown = f"***{markdown}***"
    elif markdown and bold:
        markdown = f"**{markdown}**"
    elif markdown and italic:
        markdown = f"*{markdown}*"
    return plain, markdown, footnotes, endnotes, page_break


def _paragraph(element: ET.Element, index: int, styles: dict[str, tuple[str, int | None]]) -> Paragraph:
    ppr = element.find(W + "pPr")
    style_id = ""
    list_item = False
    if ppr is not None:
        style_element = ppr.find(W + "pStyle")
        if style_element is not None:
            style_id = style_element.get(W + "val", "")
        list_item = ppr.find(W + "numPr") is not None
    style_name, heading_level = styles.get(style_id, (style_id, None))
    plain_parts: list[str] = []
    markdown_parts: list[str] = []
    footnotes: list[str] = []
    endnotes: list[str] = []
    page_break = False
    # w:del is not visible final text; w:ins is included.
    deleted_runs = {id(run) for deletion in element.iter(W + "del") for run in deletion.iter(W + "r")}
    for run in element.iter(W + "r"):
        if id(run) in deleted_runs:
            continue
        plain, markdown, fns, ens, has_break = _run_text(run)
        plain_parts.append(plain)
        markdown_parts.append(markdown)
        footnotes.extend(fns)
        endnotes.extend(ens)
        page_break = page_break or has_break
    plain_text = "".join(plain_parts).replace("\r", "").strip("\n")
    markdown = "".join(markdown_parts).replace("\r", "").strip("\n")
    if list_item and markdown.strip():
        markdown = "- " + markdown.strip()
    return Paragraph(
        source_index=index,
        markdown=markdown,
        plain_text=plain_text,
        style_id=style_id,
        style_name=style_name,
        heading_level=heading_level,
        page_break_after=page_break,
        list_item=list_item,
    )


def _table(element: ET.Element, index: int, styles: dict[str, tuple[str, int | None]]) -> Paragraph:
    rows: list[list[str]] = []
    for row in element.findall(W + "tr"):
        values: list[str] = []
        for cell in row.findall(W + "tc"):
            paragraphs = []
            for p in cell.findall(W + "p"):
                parsed = _paragraph(p, index, styles)
                if parsed.plain_text.strip():
                    paragraphs.append(parsed.plain_text.strip())
            values.append(" <br> ".join(paragraphs))
        if values:
            rows.append(values)
    plain = " / ".join(" | ".join(row) for row in rows)
    if not rows:
        markdown = ""
    else:
        width = max(len(row) for row in rows)
        normalized = [row + [""] * (width - len(row)) for row in rows]
        header = normalized[0]
        markdown_rows = ["| " + " | ".join(header) + " |", "| " + " | ".join(["---"] * width) + " |"]
        markdown_rows.extend("| " + " | ".join(row) + " |" for row in normalized[1:])
        markdown = " <br> ".join(markdown_rows)
    return Paragraph(index, markdown, plain, kind="table")


def parse_docx(path: Path) -> ParsedDocument:
    """Read a DOCX without modifying it and return normalized document structure."""
    path = path.resolve()
    raw = path.read_bytes()
    package_hash = hashlib.sha256(raw).hexdigest()
    warnings: list[str] = []
    try:
        with ZipFile(path) as archive:
            styles = _style_catalog(archive)
            footnotes = _note_catalog(archive, "word/footnotes.xml", "footnote")
            endnotes = _note_catalog(archive, "word/endnotes.xml", "endnote")
            root = ET.fromstring(archive.read("word/document.xml"))
    except (BadZipFile, KeyError, ET.ParseError) as error:
        raise ValueError(f"Invalid or unsupported DOCX: {path}: {error}") from error
    body = root.find(W + "body")
    if body is None:
        raise ValueError(f"DOCX has no document body: {path}")
    paragraphs: list[Paragraph] = []
    source_index = 0
    for child in body:
        if child.tag == W + "p":
            source_index += 1
            paragraphs.append(_paragraph(child, source_index, styles))
        elif child.tag == W + "tbl":
            source_index += 1
            paragraphs.append(_table(child, source_index, styles))
        elif child.tag != W + "sectPr":
            warnings.append(f"Unsupported body element: {child.tag.rsplit('}', 1)[-1]}")
    canonical = {
        "paragraphs": [
            {
                "text": paragraph.markdown,
                "plain": paragraph.plain_text,
                "style": paragraph.style_id,
                "heading": paragraph.heading_level,
                "page_break": paragraph.page_break_after,
                "kind": paragraph.kind,
            }
            for paragraph in paragraphs
        ],
        "footnotes": footnotes,
        "endnotes": endnotes,
    }
    encoded = json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    content_hash = hashlib.sha256(encoded).hexdigest()
    return ParsedDocument(path, package_hash, content_hash, paragraphs, footnotes, endnotes, warnings)


def normalize_for_id(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    ascii_value = "".join(char for char in decomposed if not unicodedata.combining(char))
    ascii_value = ascii_value.replace("đ", "d")
    return re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-")

