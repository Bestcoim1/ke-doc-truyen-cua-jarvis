from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from .store import ContinuityStore


SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
CANON_STATUSES = {"confirmed", "provisional", "disputed", "retconned", "obsolete", "unknown"}


def _reference(evidence: dict[str, Any]) -> str:
    if not evidence:
        return "—"
    start = evidence.get("line_start", "?")
    end = evidence.get("line_end", start)
    return f"{evidence.get('chapter_id', '?')}:L{start}-L{end}"


def generate_report(
    store: ContinuityStore,
    output_path: Path,
    *,
    arc_filter: str | None = None,
    chapter_filter: str | None = None,
) -> dict[str, int]:
    rows = store.rows("""
        SELECT i.*, e.canonical_name
        FROM issues i LEFT JOIN entities e ON e.entity_id=i.entity_id
        WHERE i.review_status='open'
    """)
    if arc_filter or chapter_filter:
        chapter_rows = store.rows("SELECT chapter_id,arc_id FROM chapters WHERE active=1")
        allowed = {
            str(row["chapter_id"])
            for row in chapter_rows
            if (not arc_filter or str(row["arc_id"]) == arc_filter)
            and (not chapter_filter or str(row["chapter_id"]) == chapter_filter)
        }
        rows = [row for row in rows if row["current_chapter_id"] in allowed or row["prior_chapter_id"] in allowed]
    rows.sort(key=lambda row: (SEVERITY_ORDER.get(str(row["severity"]), 99), -float(row["confidence"]), str(row["issue_id"])))
    counts = Counter(str(row["severity"]) for row in rows)
    lines = [
        "# Continuity Audit",
        "",
        "> Báo cáo được sinh từ candidate facts. Mọi mục là **possible contradiction** cho đến khi con người review.",
        "",
        "## Tổng quan",
        "",
        f"- Open issues: {len(rows)}",
        f"- CRITICAL: {counts['CRITICAL']}",
        f"- HIGH: {counts['HIGH']}",
        f"- MEDIUM: {counts['MEDIUM']}",
        f"- LOW: {counts['LOW']}",
        f"- INFO: {counts['INFO']}",
        "",
    ]
    for row in rows:
        current = json.loads(row["current_evidence_json"])
        prior = json.loads(row["prior_evidence_json"])
        alternatives = json.loads(row["alternatives_json"])
        lines.extend([
            f"## {row['severity']} — {row['title']}",
            "",
            f"- Issue ID: `{row['issue_id']}`",
            f"- Rule: `{row['rule_id']}`",
            f"- Audit level: `{row['audit_level']}`",
            f"- Character/entity: {row['canonical_name'] or row['entity_id'] or '—'}",
            f"- Confidence: {float(row['confidence']):.2f}",
            "",
            "### Later/current passage",
            "",
            f"Source: `{_reference(current)}`",
            "",
            f"> {current.get('source_quote', '')}",
            "",
        ])
        if prior:
            lines.extend([
                "### Earlier/compared passage",
                "",
                f"Source: `{_reference(prior)}`",
                "",
                f"> {prior.get('source_quote', '')}",
                "",
            ])
        lines.extend([
            "### Why this may conflict",
            "",
            str(row["explanation"]),
            "",
            "### Alternative explanations",
            "",
        ])
        lines.extend(f"- {alternative}" for alternative in alternatives)
        lines.extend([
            "",
            "### Suggested review",
            "",
            "Đọc lại hai đoạn nguồn, xác nhận thứ tự thời gian và đánh dấu retcon/chủ ý nếu phù hợp.",
            "",
        ])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    return dict(counts)


def review_fact(store: ContinuityStore, fact_id: str, status: str, note: str = "") -> None:
    if status not in CANON_STATUSES:
        raise ValueError(f"Invalid canon status {status!r}; choose one of {sorted(CANON_STATUSES)}")
    exists = store.connection.execute("SELECT 1 FROM facts WHERE fact_id=?", (fact_id,)).fetchone()
    if not exists:
        raise ValueError(f"Unknown fact ID: {fact_id}")
    store.connection.execute(
        """INSERT INTO canon_decisions(fact_id,status,reviewer_note) VALUES(?,?,?)
           ON CONFLICT(fact_id) DO UPDATE SET status=excluded.status,reviewer_note=excluded.reviewer_note,
                                              reviewed_at=CURRENT_TIMESTAMP""",
        (fact_id, status, note),
    )
    store.connection.commit()


def generate_canon_pages(store: ContinuityStore, canon_dir: Path) -> int:
    rows = store.rows("""
        SELECT f.*,d.status AS canon_status,d.reviewer_note,e.canonical_name,e.entity_type,
               c.title AS chapter_title,c.branch,s.source_path
        FROM canon_decisions d JOIN facts f ON f.fact_id=d.fact_id
        JOIN entities e ON e.entity_id=f.subject_id
        JOIN chapters c ON c.chapter_id=f.chapter_id
        JOIN sources s ON s.source_id=c.source_id
        ORDER BY e.entity_type,e.canonical_name,c.branch,s.source_order,c.ordinal,f.source_index
    """)
    grouped: dict[tuple[str, str, str], list[Any]] = defaultdict(list)
    for row in rows:
        grouped[(str(row["entity_type"]), str(row["subject_id"]), str(row["canonical_name"]))].append(row)
    for (entity_type, entity_id, name), facts in grouped.items():
        folder = canon_dir / ({"character": "characters", "item": "items"}.get(entity_type, entity_type + "s"))
        folder.mkdir(parents=True, exist_ok=True)
        lines = [
            f"# {name}",
            "",
            f"- Entity ID: `{entity_id}`",
            f"- Type: `{entity_type}`",
            f"- First established: `{facts[0]['chapter_id']}:L{facts[0]['line_start']}-L{facts[0]['line_end']}`",
            f"- Last confirmed/reviewed: `{facts[-1]['chapter_id']}:L{facts[-1]['line_start']}-L{facts[-1]['line_end']}`",
            "",
            "## Reviewed canon facts",
            "",
        ]
        for fact in facts:
            lines.extend([
                f"### {fact['predicate']} — {fact['canon_status']}",
                "",
                f"- Fact: `{fact['object_value'] or fact['predicate']}`",
                f"- Evidence: `{fact['chapter_id']}:L{fact['line_start']}-L{fact['line_end']}`",
                f"- Confidence at extraction: {float(fact['confidence']):.2f}",
                f"- Source quote: {fact['source_quote']}",
                f"- Reviewer note: {fact['reviewer_note'] or '—'}",
                "",
            ])
        slug = entity_id.split("-", 1)[-1]
        (folder / f"{slug}.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
    return len(grouped)
