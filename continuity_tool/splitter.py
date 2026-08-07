from __future__ import annotations

import hashlib
import json
import re
from dataclasses import replace
from dataclasses import dataclass
from pathlib import Path

from .docx_reader import normalize_for_id
from .model import Chapter, Paragraph, ParsedDocument


ROMAN = "ivxlcdm"
CHAPTER_RE = re.compile(rf"^\s*(?:chương|chapter)\s+([0-9]+|[{ROMAN}]+)(?:\b|\s*[:.\-])", re.I)
EXTRA_RE = re.compile(r"^\s*ngoại\s+truyện(?:\s+gốc)?\s+([0-9]+)(?:\b|\s*[:.(\-])", re.I)
# Plain paragraphs are section boundaries only when they use an explicit
# numbered/roman marker followed by section punctuation (or end of text).
# This deliberately rejects prose such as "Hồi trẻ...", "Phần lớn..." and
# "Tuyển tập I kết thúc...".
SECTION_RE = re.compile(
    rf"^\s*(arc|hồi|phần|route|tuyển\s+tập)\s+"
    rf"([0-9]+(?:\.[0-9]+)*|[{ROMAN}]+)\s*(?=$|[:._]|[-–—]\s)",
    re.I,
)
SECTION_HEADING_RE = re.compile(
    rf"^\s*(arc|hồi|phần|route|tuyển\s+tập)"
    rf"(?:\s+([0-9]+(?:\.[0-9]+)*|[{ROMAN}]+))?\b",
    re.I,
)
FILE_ORDER_RE = re.compile(r"^\((\d+(?:\.\d+)?)\)")


@dataclass(slots=True)
class SourcePolicy:
    source_id: str
    branch: str
    kind: str
    audit_enabled: bool
    arc_id: str
    order: float


def classify_source(path: Path, relative_path: str) -> SourcePolicy:
    name = path.stem
    folded = normalize_for_id(name)
    relative_folded = normalize_for_id(relative_path)
    order_match = FILE_ORDER_RE.match(name)
    order = float(order_match.group(1)) if order_match else 10_000.0
    prefix = f"{order:06.1f}-" if order_match else ""
    # A folder move must not change a source identity. Duplicate normalized
    # filenames are rejected by the pipeline instead of being silently merged.
    source_key = hashlib.sha256(folded.encode("utf-8")).hexdigest()[:8]
    source_id = "src-" + prefix + folded[:64].rstrip("-") + "-" + source_key
    if "ban-thao-cu-can-retcon" in relative_folded:
        return SourcePolicy(source_id, "alternate", "reference", False, "alternate", order)
    if "ho-so-phu-luc-va-tom-tat" in relative_folded:
        return SourcePolicy(source_id, "reference", "reference", False, "reference", order)
    if "tuyen-tap-da-vu-tru" in relative_folded:
        return SourcePolicy(source_id, "multiverse", "narrative", True, "multiverse-" + folded[:48], 8_000.0 + order)
    sequel = re.search(r"hau-truyen-(\d+)", relative_folded)
    if sequel:
        return SourcePolicy(source_id, "side-story", "narrative", True, f"sequel-{int(sequel.group(1)):02d}", 3_000.0 + int(sequel.group(1)))
    if folded.startswith("full-ngoai-truyen"):
        return SourcePolicy(source_id, "compilation", "compilation", False, "compilation-extra", order)
    if folded.startswith("ngoai-truyen"):
        number = re.search(r"(?:ngoai-truyen(?:-cua-truyen-goc)?)-(\d+)", folded)
        arc_id = f"extra-batch-{int(number.group(1)):02d}" if number else "extra"
        source_order = 1_000.0 + int(number.group(1)) if number else 1_999.0
        return SourcePolicy(source_id, "side-story", "narrative", True, arc_id, source_order)
    if "extra-arc" in folded:
        number = re.search(r"extra-arc-(\d+)", folded)
        arc_id = f"extra-arc-{int(number.group(1)):02d}" if number else "extra-arc"
        return SourcePolicy(source_id, "side-story", "narrative", True, arc_id, 2_000.0 + order)
    if folded.startswith("tuyen-tap"):
        return SourcePolicy(source_id, "multiverse", "narrative", True, "multiverse-" + folded[:48], 8_000.0)
    if folded.startswith("ho-so") or folded.startswith("ho-so-nhan-vat"):
        return SourcePolicy(source_id, "reference", "reference", False, "reference", order)
    if folded.startswith("truyen-ngu-ngon"):
        return SourcePolicy(source_id, "supplement", "narrative", True, "supplement-" + folded, 9_000.0)
    if name.startswith("(0)"):
        return SourcePolicy(source_id, "planning", "reference", False, "planning", order)
    if order_match and 1 <= order < 16:
        arc_number = int(order)
        return SourcePolicy(source_id, "main", "narrative", True, f"arc-{arc_number:02d}", order)
    return SourcePolicy(source_id, "reference", "reference", False, "reference", order)


def _chapter_number(text: str) -> tuple[str, str] | None:
    extra = EXTRA_RE.match(text)
    if extra:
        return "extra", f"{int(extra.group(1)):04d}"
    chapter = CHAPTER_RE.match(text)
    if chapter:
        raw = chapter.group(1)
        return "chapter", raw.zfill(3) if raw.isdigit() else raw.casefold()
    return None


def _section_match(paragraph: Paragraph) -> re.Match[str] | None:
    text = paragraph.plain_text.strip()
    if not text:
        return None
    match = SECTION_RE.match(text)
    if match:
        return match
    if paragraph.heading_level is not None:
        return SECTION_HEADING_RE.match(text)
    return None


def _section_identity(text: str, fallback: str, match: re.Match[str] | None = None) -> tuple[str, str]:
    match = match or SECTION_RE.match(text)
    if not match:
        return fallback, text.strip() or fallback
    kind = normalize_for_id(match.group(1))
    number = normalize_for_id(match.group(2) or "")
    return f"{kind}-{number}".rstrip("-"), text.strip()


def _chapter_hash(paragraphs: list[Paragraph]) -> str:
    payload = [
        [p.source_index, p.markdown, p.plain_text, p.style_id, p.heading_level, p.page_break_after, p.kind]
        for p in paragraphs
    ]
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _localize_with_notes(paragraphs: list[Paragraph], document: ParsedDocument) -> list[Paragraph]:
    localized = [replace(paragraph, source_index=index) for index, paragraph in enumerate(paragraphs, 1)]
    footnote_ids = dict.fromkeys(note_id for paragraph in paragraphs for note_id in paragraph.footnote_ids)
    endnote_ids = dict.fromkeys(note_id for paragraph in paragraphs for note_id in paragraph.endnote_ids)
    for note_id in footnote_ids:
        if note_id in document.footnotes:
            localized.append(Paragraph(len(localized) + 1, f"[^fn-{note_id}]: {document.footnotes[note_id]}", document.footnotes[note_id], kind="footnote"))
    for note_id in endnote_ids:
        if note_id in document.endnotes:
            localized.append(Paragraph(len(localized) + 1, f"[^en-{note_id}]: {document.endnotes[note_id]}", document.endnotes[note_id], kind="endnote"))
    return localized


def _has_content(paragraphs: list[Paragraph]) -> bool:
    return any(p.plain_text.strip() and not _section_match(p) for p in paragraphs)


def split_document(document: ParsedDocument, repo_root: Path) -> tuple[SourcePolicy, list[Chapter]]:
    try:
        relative_path = document.source_path.relative_to(repo_root).as_posix()
    except ValueError:
        relative_path = document.source_path.as_posix()
    policy = classify_source(document.source_path, relative_path)
    paragraphs = document.paragraphs
    if policy.kind == "reference":
        title = next((p.plain_text.strip() for p in paragraphs if p.heading_level == 1 and p.plain_text.strip()), document.source_path.stem)
        chapter_id = f"{policy.source_id}-document"
        localized = _localize_with_notes(paragraphs, document)
        chapter = Chapter(
            chapter_id, policy.source_id, relative_path, policy.branch, policy.kind, policy.audit_enabled,
            policy.arc_id, policy.arc_id, 1, title, localized, document.content_hash,
            _chapter_hash(localized), word_count=sum(len(p.plain_text.split()) for p in localized),
        )
        return policy, [chapter]

    numbered_heading_indexes = {
        index
        for index, paragraph in enumerate(paragraphs)
        if paragraph.plain_text.strip()
        and _chapter_number(paragraph.plain_text.strip())
        and (paragraph.heading_level is not None or policy.branch in {"side-story", "compilation"})
    }
    generic_heading_indexes: set[int] = set()
    if not numbered_heading_indexes and policy.branch in {"side-story", "multiverse", "supplement"}:
        nonblank_headings = [
            (index, paragraph)
            for index, paragraph in enumerate(paragraphs)
            if paragraph.heading_level is not None and paragraph.plain_text.strip()
        ]
        if nonblank_headings:
            boundary_level = min(int(paragraph.heading_level or 99) for _, paragraph in nonblank_headings)
            generic_heading_indexes = {
                index
                for index, paragraph in nonblank_headings
                if paragraph.heading_level == boundary_level
            }
    explicit_heading_indexes = numbered_heading_indexes | generic_heading_indexes
    use_explicit = bool(explicit_heading_indexes)
    groups: list[tuple[str, str, list[Paragraph], str | None]] = []
    current: list[Paragraph] = []
    pending_prefix: list[Paragraph] = []
    section_id = policy.arc_id
    section_title = policy.arc_id
    explicit_key: str | None = None

    def finish() -> None:
        nonlocal current, explicit_key, pending_prefix
        if _has_content(current):
            groups.append((section_id, section_title, pending_prefix + current, explicit_key))
            pending_prefix = []
        elif current:
            pending_prefix.extend(current)
        current = []
        explicit_key = None

    for index, paragraph in enumerate(paragraphs):
        text = paragraph.plain_text.strip()
        chapter_number = _chapter_number(text) if text else None
        section_match = _section_match(paragraph)
        if index in explicit_heading_indexes:
            finish()
            if chapter_number:
                explicit_key = f"{chapter_number[0]}-{chapter_number[1]}"
            else:
                explicit_key = f"extra-title-{normalize_for_id(text)}"
            current.append(paragraph)
            continue
        if section_match and not chapter_number:
            finish()
            section_id, section_title = _section_identity(text, policy.arc_id, section_match)
            current.append(paragraph)
            continue
        current.append(paragraph)
        # Only a manual page break in an otherwise empty paragraph is a
        # chapter fallback. Breaks attached to prose are pagination noise.
        if not use_explicit and paragraph.page_break_after and paragraph.is_blank:
            finish()
    finish()
    if not groups and paragraphs:
        groups = [(section_id, section_title, paragraphs, None)]

    chapters: list[Chapter] = []
    key_counts: dict[str, int] = {}
    section_ordinals: dict[str, int] = {}
    for ordinal, (group_section, group_title, group, key) in enumerate(groups, 1):
        group = _localize_with_notes(group, document)
        section_ordinals[group_section] = section_ordinals.get(group_section, 0) + 1
        local_ordinal = section_ordinals[group_section]
        heading_title = next(
            (
                p.plain_text.strip()
                for p in group
                if p.plain_text.strip() and (_chapter_number(p.plain_text.strip()) or p.heading_level is not None)
            ),
            "",
        )
        title = heading_title or f"{group_title} — chương {local_ordinal}"
        if key:
            base = key
        else:
            base = f"{normalize_for_id(group_section)}-seg-{local_ordinal:03d}"
        key_counts[base] = key_counts.get(base, 0) + 1
        duplicate_suffix = f"-v{key_counts[base]}" if key_counts[base] > 1 else ""
        if policy.branch == "main" and base.startswith("chapter-"):
            chapter_id = f"{policy.arc_id}-ch-{base.removeprefix('chapter-')}{duplicate_suffix}"
        elif policy.branch == "side-story" and base.startswith("extra-"):
            chapter_id = f"extra-{base.removeprefix('extra-')}--{normalize_for_id(document.source_path.stem)}{duplicate_suffix}"
        else:
            chapter_id = f"{policy.source_id}--{base}{duplicate_suffix}"
        chapters.append(
            Chapter(
                chapter_id=chapter_id,
                source_id=policy.source_id,
                source_path=relative_path,
                branch=policy.branch,
                source_kind=policy.kind,
                audit_enabled=policy.audit_enabled,
                arc_id=policy.arc_id,
                section_id=group_section,
                ordinal=ordinal,
                title=title,
                paragraphs=group,
                source_hash=document.content_hash,
                chapter_hash=_chapter_hash(group),
                word_count=sum(len(p.plain_text.split()) for p in group),
            )
        )
    return policy, chapters


def render_chapter(chapter: Chapter) -> tuple[str, list[tuple[Paragraph, int]]]:
    metadata = [
        "---",
        f"chapter_id: {json.dumps(chapter.chapter_id, ensure_ascii=False)}",
        f"source: {json.dumps(chapter.source_path, ensure_ascii=False)}",
        f"branch: {json.dumps(chapter.branch, ensure_ascii=False)}",
        f"arc: {json.dumps(chapter.arc_id, ensure_ascii=False)}",
        f"section: {json.dumps(chapter.section_id, ensure_ascii=False)}",
        f"source_hash: {json.dumps(chapter.source_hash)}",
        f"chapter_hash: {json.dumps(chapter.chapter_hash)}",
        f"word_count: {chapter.word_count}",
        "---",
        "",
        f"# {chapter.title}",
        "",
    ]
    lines = list(metadata)
    mapping: list[tuple[Paragraph, int]] = []
    for paragraph in chapter.paragraphs:
        line_number = len(lines) + 1
        value = paragraph.markdown.replace("\n", "<br>")
        if paragraph.heading_level and value.strip():
            value = f"{'#' * min(paragraph.heading_level + 1, 6)} {value.strip()}"
        elif paragraph.is_scene_break:
            value = "---"
        lines.append(value)
        mapping.append((paragraph, line_number))
    lines.append("")
    return "\n".join(lines), mapping
