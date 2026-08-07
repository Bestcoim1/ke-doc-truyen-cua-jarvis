from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


EPISTEMIC_TYPES = {
    "FACT",
    "CLAIM",
    "BELIEF",
    "RUMOR",
    "LIE",
    "SPECULATION",
    "DREAM",
    "FLASHBACK",
    "UNRELIABLE_NARRATION",
    "UNKNOWN",
}

SEVERITIES = ("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO")


@dataclass(slots=True)
class Paragraph:
    source_index: int
    markdown: str
    plain_text: str
    style_id: str = ""
    style_name: str = ""
    heading_level: int | None = None
    page_break_after: bool = False
    list_item: bool = False
    kind: str = "paragraph"
    footnote_ids: list[str] = field(default_factory=list)
    endnote_ids: list[str] = field(default_factory=list)

    @property
    def is_blank(self) -> bool:
        return not self.plain_text.strip()

    @property
    def is_scene_break(self) -> bool:
        compact = self.plain_text.strip().replace(" ", "")
        return compact in {"***", "---", "___", "*", "•*•"}


@dataclass(slots=True)
class ParsedDocument:
    source_path: Path
    package_hash: str
    content_hash: str
    paragraphs: list[Paragraph]
    footnotes: dict[str, str]
    endnotes: dict[str, str]
    warnings: list[str] = field(default_factory=list)


@dataclass(slots=True)
class Chapter:
    chapter_id: str
    source_id: str
    source_path: str
    branch: str
    source_kind: str
    audit_enabled: bool
    arc_id: str
    section_id: str
    ordinal: int
    title: str
    paragraphs: list[Paragraph]
    source_hash: str
    chapter_hash: str
    markdown_path: str = ""
    word_count: int = 0
    line_start: int = 0
    line_end: int = 0


def empty_chapter_state(chapter_id: str) -> dict[str, Any]:
    """Return the stable minimum state schema required by the audit pipeline."""
    return {
        "schema_version": 1,
        "chapter_id": chapter_id,
        "extraction_status": "candidate",
        "timeline": [],
        "characters": {},
        "locations": [],
        "items": {},
        "relationships": [],
        "knowledge_changes": [],
        "injuries_and_conditions": [],
        "abilities": [],
        "world_rules": [],
        "plot_threads_opened": [],
        "plot_threads_resolved": [],
        "promises_and_obligations": [],
        "deaths": [],
        "reveals": [],
        "uncertain_facts": [],
    }

