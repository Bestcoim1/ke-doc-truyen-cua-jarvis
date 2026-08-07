from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from continuity_tool.config import load_settings
from continuity_tool.docx_reader import parse_docx
from continuity_tool.pipeline import ContinuityPipeline
from continuity_tool.splitter import classify_source
from continuity_tool.store import ContinuityStore


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def paragraph(text: str = "", *, style: str = "", bold: bool = False, italic: bool = False, page_break: bool = False, footnote: str = "") -> str:
    ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    rpr = ""
    if bold or italic:
        rpr = "<w:rPr>" + ("<w:b/>" if bold else "") + ("<w:i/>" if italic else "") + "</w:rPr>"
    escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    run = f'<w:r>{rpr}<w:t xml:space="preserve">{escaped}</w:t>'
    if footnote:
        run += f'<w:footnoteReference w:id="{footnote}"/>'
    if page_break:
        run += '<w:br w:type="page"/>'
    run += "</w:r>"
    return f"<w:p>{ppr}{run}</w:p>"


def write_docx(path: Path, paragraphs: list[str], *, footnote_text: str = "") -> None:
    document = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="{W}"><w:body>{''.join(paragraphs)}<w:sectPr/></w:body></w:document>'''
    styles = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="{W}">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
</w:styles>'''
    content_types = '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''
    footnotes = f'''<?xml version="1.0" encoding="UTF-8"?>
<w:footnotes xmlns:w="{W}"><w:footnote w:id="1"><w:p><w:r><w:t>{footnote_text}</w:t></w:r></w:p></w:footnote></w:footnotes>'''
    path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("word/document.xml", document)
        archive.writestr("word/styles.xml", styles)
        if footnote_text:
            archive.writestr("word/footnotes.xml", footnotes)


def write_config(root: Path) -> None:
    folder = root / "continuity"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "config.json").write_text(json.dumps({
        "source_roots": ["Story"],
        "work_dir": "continuity/generated",
        "reports_dir": "continuity/reports",
        "canon_dir": "continuity/canon",
        "forgotten_thread_chapters": 3,
    }), encoding="utf-8")


class DocxExtractionTests(unittest.TestCase):
    def test_preserves_unicode_formatting_headings_breaks_and_notes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "unicode.docx"
            write_docx(path, [
                paragraph("Chương Một", style="Heading1"),
                paragraph("Tiếng Việt — 世界", bold=True, italic=True, footnote="1"),
                paragraph("***"),
                paragraph("", page_break=True),
            ], footnote_text="Ghi chú nguồn")
            parsed = parse_docx(path)
            self.assertEqual(parsed.paragraphs[0].heading_level, 1)
            self.assertIn("***Tiếng Việt — 世界[^fn-1]***", parsed.paragraphs[1].markdown)
            self.assertEqual(parsed.footnotes["1"], "Ghi chú nguồn")
            self.assertTrue(parsed.paragraphs[2].is_scene_break)
            self.assertTrue(parsed.paragraphs[3].page_break_after)
            self.assertTrue(parsed.paragraphs[3].is_blank)

    def test_content_hash_is_independent_of_zip_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            first = Path(temp) / "a.docx"
            second = Path(temp) / "b.docx"
            parts = [paragraph("Chương 1", style="Heading2"), paragraph("Nội dung")]
            write_docx(first, parts)
            write_docx(second, parts)
            self.assertEqual(parse_docx(first).content_hash, parse_docx(second).content_hash)


class PipelineTests(unittest.TestCase):
    def _fixture(self, root: Path, extra_line: str = "") -> Path:
        source = root / "Story" / "(1) Arc I.docx"
        paragraphs = [
            paragraph("ARC I", style="Heading1"),
            paragraph("Chương 1: Setup", style="Heading2"),
            paragraph("[FACT] Alice loses Silver Sword."),
            paragraph("[FACT] Bob dies."),
            paragraph("[FACT] Henry dies."),
            paragraph("[FACT] Cara uses knowledge of mask identity."),
            paragraph("[FACT] [DAY 1 08:00] Dan is in Paris."),
            paragraph("[FACT] Erin is injured."),
            paragraph("[FACT] Erik chết lặng."),
            paragraph("[FACT] Không dùng Bobby làm vũ khí."),
            paragraph("Chương 2: Consequences", style="Heading2"),
            paragraph("[FACT] Alice uses Silver Sword."),
            paragraph("[FLASHBACK] Bob appears."),
            paragraph("[FACT] Henry appears."),
            paragraph("[LIE] Bob is alive."),
            paragraph("[SPECULATION] Alice appears."),
            paragraph("[FACT] Cara learns mask identity."),
            paragraph("[FACT] [DAY 1 08:00] Dan is in Berlin."),
            paragraph("[FACT] Erin recovers."),
            paragraph("[FACT] Erik appears."),
            paragraph("[FACT] Frank gives Golden Key to Gina."),
            paragraph("[FACT] Gina uses Golden Key."),
        ]
        if extra_line:
            paragraphs.append(paragraph(extra_line))
        write_docx(source, paragraphs)
        return source

    def test_initial_rules_and_incremental_skip(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_config(root)
            source = self._fixture(root)
            original = source.read_bytes()
            pipeline = ContinuityPipeline(load_settings(root))
            first = pipeline.run()
            self.assertEqual(first.errors, [])
            self.assertEqual(first.discovered_sources, 1)
            self.assertEqual(first.changed_chapters, 2)
            self.assertEqual(source.read_bytes(), original, "source DOCX must remain byte-identical")
            with ContinuityStore(load_settings(root).database_path) as store:
                rules = {row["rule_id"] for row in store.rows("SELECT rule_id FROM issues")}
                self.assertIn("ITEM_CONTINUITY", rules)
                self.assertIn("KNOWLEDGE_LEAK", rules)
                self.assertIn("IMPOSSIBLE_TRAVEL", rules)
                self.assertIn("DEATH_REAPPEARANCE", rules)
                bob_issues = store.rows("SELECT * FROM issues WHERE entity_id='character-bob'")
                self.assertEqual(bob_issues, [], "flashback/lie/speculation must not become canon facts")
                golden = store.rows("SELECT * FROM issues WHERE entity_id LIKE 'item-golden-key%'")
                self.assertEqual(golden, [], "explicit transfer must prevent a false item warning")
                erik = store.rows("SELECT * FROM issues WHERE entity_id='character-erik'")
                self.assertEqual(erik, [], "'chết lặng' must not be classified as a death")
                bobby_item_events = store.rows(
                    "SELECT * FROM events WHERE subject_id LIKE 'item-%' AND source_quote LIKE '%Bobby%'"
                )
                self.assertEqual(bobby_item_events, [], "negated/non-item phrasing must not create an item event")
            second = pipeline.run()
            self.assertEqual(second.skipped_sources, 1)
            self.assertEqual(second.parsed_sources, 0)
            self.assertEqual(second.changed_chapters, 0)

            self._fixture(root, "A harmless added sentence.")
            third = pipeline.run()
            self.assertEqual(third.parsed_sources, 1)
            self.assertEqual(third.changed_chapters, 1)
            self.assertEqual(third.skipped_chapters, 1)

    def test_rewound_death_does_not_trigger_reappearance(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_config(root)
            source = root / "Story" / "(9) Arc IX.docx"
            write_docx(source, [
                paragraph("ARC IX", style="Heading1"),
                paragraph("Chương 67: Tự đi mà giành lấy!", style="Heading2"),
                paragraph("Zilevo đã chết."),
                paragraph("Một ván cờ đã được chơi lại. Không gian xung quanh như một cuốn băng bị tua ngược."),
                paragraph("Thân thể vỡ nát của Zilevo tự hợp nhất."),
                paragraph("Chương 68: Thà đau khổ trong sự thật.", style="Heading2"),
                paragraph("Zilevo xuất hiện và tiếp tục chiến đấu."),
            ])

            settings = load_settings(root)
            result = ContinuityPipeline(settings).run()
            self.assertEqual(result.errors, [])

            with ContinuityStore(settings.database_path) as store:
                zilevo_issues = store.rows(
                    "SELECT * FROM issues WHERE entity_id='character-zilevo'"
                )
                self.assertEqual(
                    zilevo_issues,
                    [],
                    "an explicitly rewound death must not become a durable death state",
                )
                event_types = [
                    row["event_type"]
                    for row in store.rows(
                        "SELECT e.event_type FROM events e "
                        "JOIN chapters c ON c.chapter_id=e.chapter_id "
                        "WHERE e.subject_id='character-zilevo' "
                        "ORDER BY c.ordinal,e.relative_order"
                    )
                ]
                self.assertEqual(event_types, ["death", "death_reverted", "present"])
                chapter = store.connection.execute(
                    "SELECT state_path FROM chapters WHERE chapter_id='arc-09-ch-067'"
                ).fetchone()

            state = json.loads((root / chapter["state_path"]).read_text(encoding="utf-8"))
            self.assertEqual(state["deaths"][0]["status"], "reverted")
            self.assertIn("resolution_evidence", state["deaths"][0])

    def test_blank_page_break_is_fallback_chapter_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_config(root)
            source = root / "Story" / "(1) Arc I.docx"
            write_docx(source, [
                paragraph("ARC I", style="Heading1"),
                paragraph("Đoạn một."),
                paragraph("", page_break=True),
                paragraph("Đoạn hai."),
                paragraph("Câu kết trang.", page_break=True),
                paragraph("Vẫn cùng chương vì page break gắn vào prose."),
            ])
            result = ContinuityPipeline(load_settings(root)).run(rules=False, report=False)
            self.assertEqual(result.changed_chapters, 2)

    def test_story_domain_folders_and_source_ids_survive_folder_moves(self) -> None:
        root = Path("LinhTInh")
        first = classify_source(
            root / "Hậu truyện 1" / "Hậu truyện 1_ Early Marriage #1.docx",
            "LinhTInh/Hậu truyện 1/Hậu truyện 1_ Early Marriage #1.docx",
        )
        moved = classify_source(
            root / "Đã sắp xếp" / "Hậu truyện 1_ Early Marriage #1.docx",
            "LinhTInh/Hậu truyện 1/Đã sắp xếp/Hậu truyện 1_ Early Marriage #1.docx",
        )
        multiverse = classify_source(
            root / "Tuyển tập đa vũ trụ" / "(31)Extra Arc 02.docx",
            "LinhTInh/Tuyển tập đa vũ trụ/(31)Extra Arc 02.docx",
        )
        alternate = classify_source(
            root / "Bản thảo cũ (cần retcon)" / "(16) Bản cũ.docx",
            "LinhTInh/Bản thảo cũ (cần retcon)/(16) Bản cũ.docx",
        )
        self.assertEqual(first.source_id, moved.source_id)
        self.assertEqual((first.branch, first.audit_enabled), ("side-story", True))
        self.assertEqual((multiverse.branch, multiverse.audit_enabled), ("multiverse", True))
        self.assertEqual((alternate.branch, alternate.audit_enabled), ("alternate", False))

    def test_unnumbered_side_story_heading_is_a_chapter_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_config(root)
            source = root / "Story" / "Ngoại truyện 01.docx"
            write_docx(source, [
                paragraph("Câu chuyện thứ nhất", style="Heading1"),
                paragraph("Nội dung một."),
                paragraph("Câu chuyện thứ hai", style="Heading1"),
                paragraph("Nội dung hai."),
            ])
            result = ContinuityPipeline(load_settings(root)).run(rules=False, report=False)
            self.assertEqual(result.changed_chapters, 2)

    def test_prose_starting_with_section_words_stays_inside_chapter(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_config(root)
            source = root / "Story" / "Ngoại truyện 01.docx"
            write_docx(source, [
                paragraph("Ngoại truyện 1: Chuyện thứ nhất", style="Heading2"),
                paragraph("Hồi trẻ, họ thật sự hoang dã đến vậy."),
                paragraph("Phần lớn các cảnh quay đều bị mờ."),
                paragraph("Tuyển tập I kết thúc ở đây."),
                paragraph("Arc VI-VII đẩy lỗi hy sinh đến tận cùng."),
                paragraph("Ngoại truyện 2: Chuyện thứ hai", style="Heading2"),
                paragraph("Phần tóc mái đã bị cắt quá ngắn."),
            ])
            settings = load_settings(root)
            result = ContinuityPipeline(settings).run(rules=False, report=False)
            self.assertEqual(result.changed_chapters, 2)
            with ContinuityStore(settings.database_path) as store:
                chapters = store.rows("SELECT chapter_id,title FROM chapters ORDER BY ordinal")
                self.assertEqual([row["chapter_id"] for row in chapters], [
                    "extra-0001--ngoai-truyen-01",
                    "extra-0002--ngoai-truyen-01",
                ])
                indexed = store.connection.execute(
                    "SELECT COUNT(*) FROM paragraphs WHERE plain_text LIKE 'Phần%'"
                ).fetchone()[0]
                self.assertEqual(indexed, 2)

    def test_moving_a_source_refreshes_provenance_without_semantic_rescan(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_config(root)
            original = root / "Story" / "Ngoại truyện 01.docx"
            write_docx(original, [
                paragraph("Truyện thứ nhất", style="Heading1"),
                paragraph("Nội dung một."),
                paragraph("Truyện thứ hai", style="Heading1"),
                paragraph("Nội dung hai."),
            ])
            settings = load_settings(root)
            pipeline = ContinuityPipeline(settings)
            first = pipeline.run(rules=False, report=False)
            self.assertEqual(first.changed_chapters, 2)
            with ContinuityStore(settings.database_path) as store:
                ids_before = [row["chapter_id"] for row in store.rows("SELECT chapter_id FROM chapters ORDER BY ordinal")]

            moved = root / "Story" / "Đã sắp xếp" / original.name
            moved.parent.mkdir(parents=True)
            original.replace(moved)
            second = pipeline.run(rules=False, report=False)
            self.assertEqual(second.parsed_sources, 1)
            self.assertEqual(second.changed_chapters, 0)
            self.assertEqual(second.skipped_chapters, 2)
            self.assertEqual(second.missing_sources, 0)
            with ContinuityStore(settings.database_path) as store:
                ids_after = [row["chapter_id"] for row in store.rows("SELECT chapter_id FROM chapters ORDER BY ordinal")]
                source = store.connection.execute("SELECT source_path,status FROM sources").fetchone()
                self.assertEqual(ids_before, ids_after)
                self.assertEqual(source["status"], "active")
                self.assertIn("Đã sắp xếp", source["source_path"])

    def test_removed_chapter_prunes_only_generated_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_config(root)
            source = root / "Story" / "Ngoại truyện 01.docx"
            write_docx(source, [
                paragraph("Ngoại truyện 1: Một", style="Heading2"),
                paragraph("Nội dung một."),
                paragraph("Ngoại truyện 2: Hai", style="Heading2"),
                paragraph("Nội dung hai."),
            ])
            settings = load_settings(root)
            pipeline = ContinuityPipeline(settings)
            pipeline.run(rules=False, report=False)
            with ContinuityStore(settings.database_path) as store:
                removed_row = store.connection.execute(
                    "SELECT extracted_path,state_path FROM chapters WHERE chapter_id='extra-0002--ngoai-truyen-01'"
                ).fetchone()
                extracted = root / removed_row["extracted_path"]
                state = root / removed_row["state_path"]
            self.assertTrue(extracted.exists())
            self.assertTrue(state.exists())
            original_bytes = source.read_bytes()

            write_docx(source, [
                paragraph("Ngoại truyện 1: Một", style="Heading2"),
                paragraph("Nội dung một."),
                paragraph("Nội dung hai được nhập lại."),
            ])
            result = pipeline.run(rules=False, report=False)
            self.assertEqual(result.removed_chapters, 1)
            self.assertEqual(result.removed_artifacts, 2)
            self.assertFalse(extracted.exists())
            self.assertFalse(state.exists())
            self.assertNotEqual(source.read_bytes(), original_bytes, "fixture rewrite must be the only source change")


if __name__ == "__main__":
    unittest.main()
