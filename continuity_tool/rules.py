from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from typing import Any, Iterable

from .store import ContinuityStore


SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}


def _domain(branch: str, arc_id: str) -> str:
    if branch in {"main", "side-story", "supplement"}:
        return "canon-main"
    if branch == "multiverse":
        return arc_id
    return branch


def _issue_id(rule_id: str, entity_id: str, prior: str | None, current: str, detail: str = "") -> str:
    raw = f"{rule_id}|{entity_id}|{prior or ''}|{current}|{detail}".encode("utf-8")
    return "issue-" + hashlib.sha256(raw).hexdigest()[:20]


def _evidence(row: Any) -> dict[str, Any]:
    return {
        "chapter_id": row["chapter_id"],
        "source": row["source_path"],
        "line_start": int(row["line_start"]),
        "line_end": int(row["line_end"]),
        "source_quote": row["source_quote"],
    }


def _audit_level(prior: Any | None, current: Any) -> str:
    if prior is None:
        return "global"
    if prior["source_id"] == current["source_id"] and abs(int(prior["chapter_ordinal"]) - int(current["chapter_ordinal"])) == 1:
        return "adjacent"
    if prior["arc_id"] == current["arc_id"]:
        return "arc"
    return "global"


def _row_issue(
    *,
    run_id: int,
    rule_id: str,
    severity: str,
    confidence: float,
    entity_id: str,
    current: Any,
    prior: Any | None,
    title: str,
    explanation: str,
    alternatives: list[str],
    detail: str = "",
) -> dict[str, Any]:
    return {
        "issue_id": _issue_id(rule_id, entity_id, prior["chapter_id"] if prior else None, current["chapter_id"], detail),
        "rule_id": rule_id,
        "severity": severity,
        "confidence": confidence,
        "audit_level": _audit_level(prior, current),
        "branch": _domain(str(current["branch"]), str(current["arc_id"])),
        "entity_id": entity_id,
        "current_chapter_id": current["chapter_id"],
        "prior_chapter_id": prior["chapter_id"] if prior else None,
        "title": title,
        "explanation": explanation,
        "current_evidence_json": json.dumps(_evidence(current), ensure_ascii=False, sort_keys=True),
        "prior_evidence_json": json.dumps(_evidence(prior), ensure_ascii=False, sort_keys=True) if prior else "{}",
        "alternatives_json": json.dumps(alternatives, ensure_ascii=False),
        "review_status": "open",
        "created_run": run_id,
    }


EVENT_QUERY = """
SELECT e.*, c.branch, c.arc_id, c.section_id, c.ordinal AS chapter_ordinal, c.source_id,
       s.source_path, s.source_order
FROM events e
JOIN chapters c ON c.chapter_id=e.chapter_id
JOIN sources s ON s.source_id=c.source_id
WHERE c.active=1 AND c.audit_enabled=1 AND e.epistemic_type='FACT'
ORDER BY s.source_order, s.source_path, c.ordinal, e.relative_order, e.source_index
"""


def _item_rules(rows: Iterable[Any], run_id: int) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    states: dict[tuple[str, str], Any] = {}
    for row in rows:
        event_type = str(row["event_type"])
        if not event_type.startswith("item_"):
            continue
        key = (_domain(str(row["branch"]), str(row["arc_id"])), str(row["subject_id"]))
        prior = states.get(key)
        if event_type == "item_used" and prior and prior["event_type"] in {"item_lost", "item_destroyed"}:
            destroyed = prior["event_type"] == "item_destroyed"
            issues.append(_row_issue(
                run_id=run_id,
                rule_id="ITEM_REAPPEARANCE" if destroyed else "ITEM_CONTINUITY",
                severity="HIGH" if destroyed else "MEDIUM",
                confidence=0.92 if destroyed else 0.86,
                entity_id=str(row["subject_id"]),
                current=row,
                prior=prior,
                title="Vật phẩm bị phá hủy lại xuất hiện" if destroyed else "Vật phẩm đã mất được sử dụng lại",
                explanation="Không tìm thấy sự kiện thu hồi, tái tạo hoặc chuyển giao đủ rõ giữa hai bằng chứng.",
                alternatives=["Vật phẩm được thu hồi ngoài cảnh.", "Hai đoạn nói về hai vật phẩm cùng tên.", "Đây là hồi tưởng hoặc mốc thời gian phi tuyến."],
            ))
        if event_type in {"item_lost", "item_destroyed", "item_recovered", "item_transfer"}:
            states[key] = row
    return issues


def _character_rules(rows: Iterable[Any], run_id: int) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    death: dict[tuple[str, str], Any] = {}
    injury: dict[tuple[str, str], Any] = {}
    for row in rows:
        key = (_domain(str(row["branch"]), str(row["arc_id"])), str(row["subject_id"]))
        event_type = str(row["event_type"])
        if event_type == "death":
            death[key] = row
        elif event_type == "death_reverted":
            death.pop(key, None)
        elif event_type == "present" and key in death:
            issues.append(_row_issue(
                run_id=run_id, rule_id="DEATH_REAPPEARANCE", severity="CRITICAL", confidence=0.94,
                entity_id=str(row["subject_id"]), current=row, prior=death[key],
                title="Nhân vật đã chết xuất hiện trở lại",
                explanation="Một sự kiện hiện tại xác nhận nhân vật xuất hiện sau bằng chứng tử vong, nhưng chưa có hồi sinh hoặc retcon được xác nhận.",
                alternatives=["Cảnh sau là hồi tưởng/giấc mơ.", "Cái chết trước đó là giả hoặc chỉ là lời kể không đáng tin.", "Có sự kiện hồi sinh chưa được trích xuất."],
            ))
            # One unresolved death should produce one review item, not a new
            # duplicate for every later scene containing the character.
            death.pop(key, None)
        if event_type == "injured":
            injury[key] = row
        elif event_type == "recovered":
            injury.pop(key, None)
    return issues


def _knowledge_rules(rows: Iterable[Any], run_id: int) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str], list[Any]] = defaultdict(list)
    for row in rows:
        if row["event_type"] not in {"knowledge_learned", "knowledge_used"}:
            continue
        metadata = json.loads(row["metadata_json"] or "{}")
        key = metadata.get("knowledge_key")
        if not key:
            continue
        grouped[(_domain(str(row["branch"]), str(row["arc_id"])), str(row["subject_id"]), key)].append(row)
    issues: list[dict[str, Any]] = []
    for (_, entity_id, knowledge_key), events in grouped.items():
        learned = next((event for event in events if event["event_type"] == "knowledge_learned"), None)
        if not learned:
            continue
        for used in (event for event in events if event["event_type"] == "knowledge_used"):
            if events.index(used) < events.index(learned):
                issues.append(_row_issue(
                    run_id=run_id, rule_id="KNOWLEDGE_LEAK", severity="HIGH", confidence=0.91,
                    entity_id=entity_id, current=used, prior=learned,
                    title="Possible knowledge leak",
                    explanation="Nhân vật hành động dựa trên thông tin trước mốc đầu tiên hệ thống thấy họ biết thông tin đó.",
                    alternatives=["Nhân vật biết ngoài cảnh.", "Mốc sau là xác nhận chứ không phải lần đầu biết.", "Hai cách diễn đạt chưa được hợp nhất đúng."],
                    detail=knowledge_key,
                ))
    return issues


def _location_rules(rows: Iterable[Any], run_id: int) -> list[dict[str, Any]]:
    previous: dict[tuple[str, str], Any] = {}
    issues: list[dict[str, Any]] = []
    for row in rows:
        if row["event_type"] != "location" or row["story_time"] is None:
            continue
        key = (_domain(str(row["branch"]), str(row["arc_id"])), str(row["subject_id"]))
        prior = previous.get(key)
        if prior and str(prior["location"]).casefold() != str(row["location"]).casefold():
            delta = int(row["story_time"]) - int(prior["story_time"])
            if delta <= 0:
                issues.append(_row_issue(
                    run_id=run_id, rule_id="IMPOSSIBLE_TRAVEL", severity="HIGH", confidence=0.93,
                    entity_id=str(row["subject_id"]), current=row, prior=prior,
                    title="Nhân vật ở hai địa điểm không thể đồng thời",
                    explanation="Hai bằng chứng thời gian tuyệt đối/định danh đặt nhân vật ở địa điểm khác nhau mà không có thời gian di chuyển.",
                    alternatives=["Một mốc thời gian thuộc flashback.", "Địa danh là hai tên của cùng một nơi.", "Mốc thời gian trong nguồn chỉ là ước lượng."],
                ))
        previous[key] = row
    return issues


def _age_rules(store: ContinuityStore, run_id: int) -> list[dict[str, Any]]:
    rows = store.rows("""
        SELECT f.*, c.branch, c.arc_id, c.section_id, c.ordinal AS chapter_ordinal, c.source_id,
               s.source_path, s.source_order
        FROM facts f JOIN chapters c ON c.chapter_id=f.chapter_id JOIN sources s ON s.source_id=c.source_id
        WHERE c.active=1 AND c.audit_enabled=1 AND f.epistemic_type='FACT' AND f.predicate='age'
        ORDER BY s.source_order,s.source_path,c.ordinal,f.source_index
    """)
    previous: dict[tuple[str, str], Any] = {}
    issues: list[dict[str, Any]] = []
    for row in rows:
        key = (_domain(str(row["branch"]), str(row["arc_id"])), str(row["subject_id"]))
        prior = previous.get(key)
        if prior and prior["object_value"] != row["object_value"]:
            issues.append(_row_issue(
                run_id=run_id, rule_id="AGE_MISMATCH", severity="LOW", confidence=0.72,
                entity_id=str(row["subject_id"]), current=row, prior=prior,
                title="Tuổi nhân vật không nhất quán",
                explanation="Hai bằng chứng nêu tuổi khác nhau; hệ thống chưa có đủ thời gian tuyệt đối để xác nhận đây là lỗi.",
                alternatives=["Đã có sinh nhật hoặc time skip.", "Một con số là tuổi tại thời điểm hồi tưởng.", "Một nguồn là lời nói không chính xác."],
            ))
        previous[key] = row
    return issues


def _plot_thread_rules(store: ContinuityStore, run_id: int, threshold: int) -> list[dict[str, Any]]:
    rows = store.rows("""
        SELECT f.*, c.branch,c.arc_id,c.section_id,c.ordinal AS chapter_ordinal,c.source_id,
               s.source_path,s.source_order
        FROM facts f JOIN chapters c ON c.chapter_id=f.chapter_id JOIN sources s ON s.source_id=c.source_id
        WHERE c.active=1 AND c.audit_enabled=1 AND f.epistemic_type='FACT'
          AND f.predicate IN ('plot_opened','plot_resolved')
        ORDER BY s.source_order,s.source_path,c.ordinal,f.source_index
    """)
    opened: dict[tuple[str, str], tuple[Any, int]] = {}
    sequence = 0
    for row in rows:
        sequence += 1
        key = (_domain(str(row["branch"]), str(row["arc_id"])), normalize_key(str(row["object_value"])))
        if row["predicate"] == "plot_opened":
            opened[key] = (row, sequence)
        else:
            opened.pop(key, None)
    issues: list[dict[str, Any]] = []
    max_sequence = sequence
    for (_, thread), (row, start) in opened.items():
        if max_sequence - start < threshold:
            continue
        issues.append(_row_issue(
            run_id=run_id, rule_id="POSSIBLY_FORGOTTEN_THREAD", severity="INFO", confidence=0.6,
            entity_id=str(row["subject_id"]), current=row, prior=None,
            title="Plot thread có thể đã bị bỏ quên",
            explanation=f"Thread chưa có mốc resolve sau ít nhất {threshold} chapter/event được đánh dấu.",
            alternatives=["Thread được cố ý để mở.", "Mốc resolve chưa được gắn annotation.", "Thread sẽ được xử lý ở arc sau."],
            detail=thread,
        ))
    return issues


def normalize_key(value: str) -> str:
    return "-".join(value.casefold().split())


def run_continuity_rules(store: ContinuityStore, run_id: int, forgotten_threshold: int = 30) -> list[dict[str, Any]]:
    rows = store.rows(EVENT_QUERY)
    store.clear_open_issues()
    issues = (
        _item_rules(rows, run_id)
        + _character_rules(rows, run_id)
        + _knowledge_rules(rows, run_id)
        + _location_rules(rows, run_id)
        + _age_rules(store, run_id)
        + _plot_thread_rules(store, run_id, forgotten_threshold)
    )
    for issue in issues:
        store.save_issue(issue)
    store.connection.commit()
    return sorted(issues, key=lambda issue: (SEVERITY_ORDER[issue["severity"]], -issue["confidence"], issue["issue_id"]))
