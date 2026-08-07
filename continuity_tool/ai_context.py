from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .docx_reader import normalize_for_id
from .model import EPISTEMIC_TYPES
from .store import ContinuityStore


def build_context_bundle(store: ContinuityStore, repo_root: Path, chapter_id: str) -> dict[str, Any]:
    chapter = store.connection.execute(
        """SELECT c.*,s.source_path,s.source_order FROM chapters c JOIN sources s ON s.source_id=c.source_id
           WHERE c.chapter_id=? AND c.active=1""",
        (chapter_id,),
    ).fetchone()
    if not chapter:
        raise ValueError(f"Unknown active chapter: {chapter_id}")
    extracted_path = repo_root / str(chapter["extracted_path"])
    state_path = repo_root / str(chapter["state_path"])
    previous = store.connection.execute(
        """SELECT c.* FROM chapters c JOIN sources s ON s.source_id=c.source_id
           WHERE c.active=1 AND c.audit_enabled=1
             AND (s.source_order < ? OR (s.source_order=? AND (s.source_path < ? OR (s.source_path=? AND c.ordinal < ?))))
           ORDER BY s.source_order DESC,s.source_path DESC,c.ordinal DESC LIMIT 1""",
        (chapter["source_order"], chapter["source_order"], chapter["source_path"], chapter["source_path"], chapter["ordinal"]),
    ).fetchone()
    entity_ids = [
        str(row[0]) for row in store.connection.execute(
            "SELECT DISTINCT entity_id FROM mentions WHERE chapter_id=?", (chapter_id,)
        )
    ]
    relevant_facts: list[dict[str, Any]] = []
    if entity_ids:
        placeholders = ",".join("?" for _ in entity_ids)
        rows = store.rows(
            f"""SELECT f.fact_id,f.subject_id,e.canonical_name,f.predicate,f.object_value,f.epistemic_type,
                       f.confidence,f.chapter_id,f.line_start,f.line_end,f.source_quote,d.status AS canon_status
                FROM facts f JOIN entities e ON e.entity_id=f.subject_id
                LEFT JOIN canon_decisions d ON d.fact_id=f.fact_id
                WHERE f.subject_id IN ({placeholders}) AND f.chapter_id<>?
                ORDER BY CASE WHEN d.status='confirmed' THEN 0 WHEN d.status='provisional' THEN 1 ELSE 2 END,
                         f.confidence DESC LIMIT 200""",
            tuple(entity_ids) + (chapter_id,),
        )
        relevant_facts = [dict(row) for row in rows]
    issues = [
        dict(row) for row in store.rows(
            "SELECT issue_id,severity,rule_id,title,confidence,current_chapter_id,prior_chapter_id FROM issues WHERE review_status='open' AND (current_chapter_id=? OR prior_chapter_id=?)",
            (chapter_id, chapter_id),
        )
    ]
    previous_state: dict[str, Any] | None = None
    if previous and previous["state_path"]:
        candidate = repo_root / str(previous["state_path"])
        if candidate.exists():
            previous_state = json.loads(candidate.read_text(encoding="utf-8"))
    return {
        "schema_version": 1,
        "purpose": "semantic chapter-state extraction; output remains candidate until human review",
        "chapter": {
            "chapter_id": chapter_id,
            "branch": chapter["branch"],
            "arc_id": chapter["arc_id"],
            "section_id": chapter["section_id"],
            "title": chapter["title"],
            "text_markdown": extracted_path.read_text(encoding="utf-8") if extracted_path.exists() else "",
        },
        "previous_chapter_state": previous_state,
        "relevant_prior_facts": relevant_facts,
        "open_issues": issues,
        "instructions": {
            "provenance": "Every candidate fact must cite this chapter_id and an extracted Markdown line range.",
            "epistemic_types": sorted(EPISTEMIC_TYPES),
            "canon_policy": "Do not promote candidates to confirmed canon. Claims, lies, dreams and flashbacks must keep their type.",
            "quote_policy": "Use only a short supporting quote.",
        },
    }


def import_candidate_state(store: ContinuityStore, repo_root: Path, path: Path) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    chapter_id = str(data.get("chapter_id", ""))
    chapter = store.connection.execute("SELECT * FROM chapters WHERE chapter_id=? AND active=1", (chapter_id,)).fetchone()
    if not chapter:
        raise ValueError(f"Unknown active chapter_id in candidate file: {chapter_id!r}")
    valid_lines = {
        int(row["line_start"]): row
        for row in store.rows("SELECT * FROM paragraphs WHERE chapter_id=?", (chapter_id,))
    }
    imported = 0
    accepted: list[dict[str, Any]] = []
    for index, candidate in enumerate(data.get("candidate_facts", []), 1):
        epistemic = str(candidate.get("epistemic_type", "UNKNOWN")).upper()
        if epistemic not in EPISTEMIC_TYPES:
            raise ValueError(f"candidate_facts[{index}] has invalid epistemic_type: {epistemic}")
        evidence = candidate.get("evidence") or {}
        line_start = int(evidence.get("line_start", 0))
        line_end = int(evidence.get("line_end", line_start))
        if line_start not in valid_lines:
            raise ValueError(f"candidate_facts[{index}] cites a line not present in {chapter_id}: {line_start}")
        subject = candidate.get("subject") or {}
        entity_type = str(subject.get("type", "unknown"))
        name = str(subject.get("name", "")).strip()
        if not name:
            raise ValueError(f"candidate_facts[{index}] has no subject.name")
        entity_id = str(subject.get("id") or f"{entity_type}-{normalize_for_id(name)}")
        store.ensure_entity(entity_id, entity_type, name)
        predicate = str(candidate.get("predicate", "")).strip()
        if not predicate:
            raise ValueError(f"candidate_facts[{index}] has no predicate")
        object_value = str(candidate.get("object", "")).strip()
        raw = f"ai|{chapter_id}|{line_start}|{predicate}|{entity_id}|{object_value}".encode("utf-8")
        fact_id = "fact-ai-" + hashlib.sha256(raw).hexdigest()[:20]
        source_row = valid_lines[line_start]
        quote = str(evidence.get("source_quote") or source_row["source_quote"])[:240]
        confidence = max(0.0, min(1.0, float(candidate.get("confidence", 0.5))))
        store.save_fact({
            "fact_id": fact_id,
            "chapter_id": chapter_id,
            "source_index": int(source_row["source_index"]),
            "subject_id": entity_id,
            "predicate": predicate,
            "object_value": object_value,
            "epistemic_type": epistemic,
            "confidence": confidence,
            "review_status": "candidate",
            "line_start": line_start,
            "line_end": line_end,
            "source_quote": quote,
            "metadata_json": json.dumps({"extractor": "external-ai", "candidate_only": True}, ensure_ascii=False),
        })
        store.save_dependency(chapter_id, "entity", entity_id)
        accepted.append({**candidate, "fact_id": fact_id})
        imported += 1
    store.connection.commit()
    state_path = repo_root / str(chapter["state_path"])
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {"chapter_id": chapter_id}
    state["ai_candidate_facts"] = accepted
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    return imported

