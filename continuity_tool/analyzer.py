from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any

from .docx_reader import normalize_for_id
from .model import Chapter, EPISTEMIC_TYPES, Paragraph, empty_chapter_state
from .store import ContinuityStore


NAME = r"(?-i:[^\W\d_]+)"
TIME_RE = re.compile(r"\[DAY\s+(\d+)\s+(\d{1,2}):(\d{2})\]", re.I)
TYPE_RE = re.compile(r"^\s*\[(%s)\]\s*" % "|".join(sorted(EPISTEMIC_TYPES)), re.I)

KNOWN_CHARACTERS = {
    "Erik", "Eve", "Evelynn", "Juno", "Junovel", "Gabi", "Gabriel", "Claire", "Aelgasa",
    "Claudia", "Rueb", "Hina", "Memoro", "Glemsel", "Yume", "Elise", "Zyanya", "Andrea",
    "Milio", "Lio", "Aura", "Lalita", "Kenji", "Silas", "Helen", "Thomas", "Lylin", "Lucifer",
    "Lilith", "Charlie", "Happi", "Zilevo", "Elpida", "Zetsubou", "Joy", "June", "Vita",
}

MENTION_RE = re.compile(r"(?<![\wÀ-ỹĐđ])(" + "|".join(sorted(map(re.escape, KNOWN_CHARACTERS), key=len, reverse=True)) + r")(?![\wÀ-ỹĐđ])", re.I)

EVENT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("death", re.compile(rf"\b(?P<subject>{NAME})\s+(?:dies|died|is dead|was killed|đã chết(?:\s+rồi)?|bị giết|qua đời|tử vong|chết(?:\s+rồi)?(?=\s*[.!?;]|$))\b", re.I)),
    ("death_reverted", re.compile(rf"\b(?P<subject>{NAME})\s+(?:is revived|was revived|returns? to life|came back to life|được hồi sinh|được cứu sống|sống lại|tái sinh|trở lại sự sống)\b", re.I)),
    (
        "death_reverted",
        re.compile(
            rf"\b(?:body|corpse|thân thể|cơ thể|thi thể)\b[^.!?;]{{0,80}}"
            rf"\b(?:of|của)\s+(?P<subject>{NAME})\s+"
            rf"(?:reassembled|was restored|tự hợp nhất|được hợp nhất|được khôi phục|được tái tạo|tái tạo)\b",
            re.I,
        ),
    ),
    ("present", re.compile(rf"\b(?P<subject>{NAME})\s+(?:appears|reappears|is alive|xuất hiện|tái xuất|vẫn sống)\b", re.I)),
    ("injured", re.compile(rf"\b(?P<subject>{NAME})\s+(?:is injured|was injured|bị thương|gãy (?:tay|chân))\b", re.I)),
    ("recovered", re.compile(rf"\b(?P<subject>{NAME})\s+(?:recovers|recovered|is uninjured|is fully healed|hồi phục|khỏi hẳn|lành vết thương)\b", re.I)),
    ("item_lost", re.compile(rf"\b(?P<subject>{NAME})\s+(?:loses|lost|đánh mất|làm mất)\s+(?P<object>[^.!?;]{{1,80}})", re.I)),
    ("item_destroyed", re.compile(rf"\b(?P<subject>{NAME})\s+(?:destroys|destroyed|phá hủy)\s+(?P<object>[^.!?;]{{1,80}})", re.I)),
    ("item_recovered", re.compile(rf"\b(?P<subject>{NAME})\s+(?:recovers|recovered|finds|found|tìm lại|lấy lại)\s+(?P<object>[^.!?;]{{1,80}})", re.I)),
    ("item_used", re.compile(rf"\b(?P<subject>{NAME})\s+(?:uses|used|sử dụng|dùng)\s+(?P<object>[^.!?;]{{1,80}})", re.I)),
    ("item_transfer", re.compile(rf"\b(?P<subject>{NAME})\s+(?:gives|gave|hands|handed|trao|đưa)\s+(?P<object>[^.!?;]{{1,60}}?)\s+(?:to|cho)\s+(?P<target>{NAME})\b", re.I)),
    ("knowledge_learned", re.compile(rf"\b(?P<subject>{NAME})\s+(?:learns|learned|discovers|discovered|biết được|phát hiện)\s+(?:that\s+)?(?P<object>[^.!?;]{{1,100}})", re.I)),
    ("knowledge_used", re.compile(rf"\b(?P<subject>{NAME})\s+(?:uses knowledge of|acts on|dựa vào bí mật|dùng bí mật)\s+(?P<object>[^.!?;]{{1,100}})", re.I)),
    ("location", re.compile(rf"\b(?P<subject>{NAME})\s+(?:is|was|ở|đang ở|có mặt)\s+(?:at|in|tại|ở)\s+(?P<object>[A-ZÀ-ỴĐ][^.!?;]{{1,70}})", re.I)),
    ("age", re.compile(rf"\b(?P<subject>{NAME})(?:,\s*lúc này)?\s+(?:is|was|đã|hiện)\s+(?P<object>\d{{1,3}})\s+(?:years old|tuổi)\b", re.I)),
    ("plot_opened", re.compile(r"\[(?:THREAD|PLOT)\s+OPEN\s*:\s*(?P<object>[^\]]+)\]", re.I)),
    ("plot_resolved", re.compile(r"\[(?:THREAD|PLOT)\s+RESOLVED\s*:\s*(?P<object>[^\]]+)\]", re.I)),
]

SUBJECT_STOPWORDS = {
    "anh", "cô", "cậu", "chị", "em", "hắn", "họ", "nó", "ông", "bà", "người", "mình", "ta",
    "không", "đừng", "he", "she", "they", "it", "we", "you", "i", "never",
}

OBJECT_STOPWORDS = {
    "nó", "điều đó", "chuyện đó", "thứ đó", "cái đó", "hắn", "cô ấy", "anh ấy", "it", "that", "him", "her",
}

ITEM_HINTS = {
    "armor", "artifact", "amulet", "book", "box", "car", "dress", "gun", "key", "knife", "necklace", "phone", "ring", "sword", "weapon",
    "áo", "bùa", "chìa khóa", "dao", "dây chuyền", "điện thoại", "giáp", "hộp", "kiếm", "nhẫn", "sách", "súng", "thần khí", "vũ khí", "xe",
}


def _entity(entity_type: str, name: str) -> tuple[str, str]:
    cleaned = re.sub(r"\s+", " ", name.strip(" \t\"'“”‘’.,:;!?"))
    if entity_type == "item":
        cleaned = re.sub(r"^(?:the|a|an|cái|chiếc|thanh|một)\s+", "", cleaned, flags=re.I)
    return f"{entity_type}-{normalize_for_id(cleaned)}", cleaned


def _fact_id(chapter_id: str, source_index: int, predicate: str, subject_id: str, object_value: str) -> str:
    raw = f"{chapter_id}|{source_index}|{predicate}|{subject_id}|{object_value}".encode("utf-8")
    return "fact-" + hashlib.sha256(raw).hexdigest()[:20]


def _event_id(fact_id: str) -> str:
    return "event-" + fact_id.removeprefix("fact-")


def _epistemic_type(text: str, nearby_text: str) -> tuple[str, str]:
    marker = TYPE_RE.match(text)
    if marker:
        return marker.group(1).upper(), TYPE_RE.sub("", text, count=1)
    folded = f"{nearby_text} {text}".casefold()
    if any(word in folded for word in ("trong mơ", "giấc mơ", "ảo ảnh", "ảo giác", "dream", "dreamed", "illusion")):
        return "DREAM", text
    if any(word in folded for word in ("hồi tưởng", "hồi ức", "flashback", "ký ức hiện về")):
        return "FLASHBACK", text
    if any(word in folded for word in ("nói dối", "lied", "lời nói dối")):
        return "LIE", text
    if any(word in folded for word in ("có lẽ", "dường như", "tưởng", "ngỡ", "perhaps", "maybe", "rumor", "tin đồn")):
        return "SPECULATION", text
    stripped = text.lstrip()
    if stripped.startswith(('"', "“", "'")):
        return "CLAIM", text
    return "FACT", text


def _story_time(text: str) -> int | None:
    match = TIME_RE.search(text)
    if not match:
        return None
    day, hour, minute = map(int, match.groups())
    return day * 1440 + hour * 60 + minute


def _evidence(chapter: Chapter, paragraph: Paragraph, line: int, quote_limit: int) -> dict[str, Any]:
    quote = re.sub(r"\s+", " ", paragraph.plain_text).strip()[:quote_limit]
    return {
        "chapter_id": chapter.chapter_id,
        "source": chapter.source_path,
        "paragraph": paragraph.source_index,
        "line_start": line,
        "line_end": line,
        "source_quote": quote,
    }


@dataclass(slots=True)
class AnalysisResult:
    state: dict[str, Any]
    facts: int
    mentions: int


def analyze_chapter(
    store: ContinuityStore,
    chapter: Chapter,
    paragraph_lines: list[tuple[Paragraph, int]],
    quote_limit: int = 240,
) -> AnalysisResult:
    """Extract conservative candidate states. Only FACT events feed rule checks."""
    state = empty_chapter_state(chapter.chapter_id)
    state["source_hash"] = chapter.source_hash
    state["chapter_hash"] = chapter.chapter_hash
    state["provenance"] = {
        "source": chapter.source_path,
        "branch": chapter.branch,
        "arc": chapter.arc_id,
        "section": chapter.section_id,
    }
    facts_count = 0
    mention_count = 0
    previous_text: list[str] = []
    known_mentions: set[tuple[int, str]] = set()
    active_death_indexes: dict[str, int] = {}
    for relative_order, (paragraph, line) in enumerate(paragraph_lines, 1):
        if not paragraph.plain_text.strip():
            continue
        evidence = _evidence(chapter, paragraph, line, quote_limit)
        nearby = " ".join(previous_text[-2:])
        epistemic, analyzable_text = _epistemic_type(paragraph.plain_text, nearby)
        explicit_marker = TYPE_RE.match(paragraph.plain_text) is not None
        temporal_mode = "flashback" if epistemic == "FLASHBACK" else "dream" if epistemic == "DREAM" else "present"
        for mention in MENTION_RE.finditer(paragraph.plain_text):
            canonical = next((name for name in KNOWN_CHARACTERS if name.casefold() == mention.group(1).casefold()), mention.group(1))
            entity_id, name = _entity("character", canonical)
            store.ensure_entity(entity_id, "character", name)
            if (paragraph.source_index, entity_id) not in known_mentions:
                store.save_mention({
                    "chapter_id": chapter.chapter_id,
                    "source_index": paragraph.source_index,
                    "entity_id": entity_id,
                    "line_start": line,
                    "line_end": line,
                    "source_quote": evidence["source_quote"],
                    "confidence": 0.72,
                })
                known_mentions.add((paragraph.source_index, entity_id))
                mention_count += 1
                store.save_dependency(chapter.chapter_id, "entity", entity_id)
                state["characters"].setdefault(entity_id, {"name": name, "mentions": []})["mentions"].append(evidence)

        for event_type, pattern in EVENT_PATTERNS:
            for match in pattern.finditer(analyzable_text):
                data = match.groupdict()
                if event_type.startswith("plot_"):
                    subject_name = "plot-thread"
                else:
                    subject_name = data.get("subject") or "unknown"
                if not subject_name[:1].isupper() or subject_name.casefold().strip() in SUBJECT_STOPWORDS:
                    continue
                subject_id, normalized_subject = _entity("character", subject_name)
                store.ensure_entity(subject_id, "character", normalized_subject)
                store.save_dependency(chapter.chapter_id, "entity", subject_id)
                if (paragraph.source_index, subject_id) not in known_mentions and subject_name != "plot-thread":
                    store.save_mention({
                        "chapter_id": chapter.chapter_id,
                        "source_index": paragraph.source_index,
                        "entity_id": subject_id,
                        "line_start": line,
                        "line_end": line,
                        "source_quote": evidence["source_quote"],
                        "confidence": 0.85,
                    })
                    known_mentions.add((paragraph.source_index, subject_id))
                    mention_count += 1
                object_value = (data.get("object") or "").strip(" \t\"'“”‘’.,:;!?")
                if event_type.startswith("item_"):
                    object_value = object_value.split(",", 1)[0].strip()
                if event_type.startswith("item_") and object_value.casefold() in OBJECT_STOPWORDS:
                    continue
                if event_type.startswith("item_"):
                    prefix = analyzable_text[max(0, match.start() - 24):match.start()].casefold()
                    if event_type == "item_used" and any(negation in prefix for negation in ("không ", "đừng ", "never ", "does not ", "did not ")):
                        continue
                    folded_object = object_value.casefold()
                    first_tokens = " ".join(folded_object.split()[:3])
                    has_item_hint = any(
                        re.search(r"(?<!\w)" + re.escape(hint) + r"(?!\w)", first_tokens)
                        for hint in ITEM_HINTS
                    )
                    if not explicit_marker and (
                        len(object_value.split()) > 8
                        or not has_item_hint
                    ):
                        continue
                predicate = event_type
                metadata: dict[str, Any] = {"temporal_mode": temporal_mode}
                if event_type == "death_reverted":
                    metadata["resolution_type"] = "timeline_rewind_or_life_restoration"
                if data.get("target"):
                    target_id, target_name = _entity("character", data["target"])
                    store.ensure_entity(target_id, "character", target_name)
                    metadata["target_id"] = target_id
                    store.save_dependency(chapter.chapter_id, "entity", target_id)
                item_id = ""
                if event_type.startswith("item_"):
                    item_id, item_name = _entity("item", object_value)
                    if not item_name:
                        continue
                    store.ensure_entity(item_id, "item", item_name)
                    store.save_dependency(chapter.chapter_id, "entity", item_id)
                    metadata["item_id"] = item_id
                    metadata["holder_id"] = subject_id
                    state["items"].setdefault(item_id, {"name": item_name, "changes": []})["changes"].append(
                        {"type": event_type.removeprefix("item_"), "epistemic_type": epistemic, "evidence": evidence}
                    )
                if event_type.startswith("knowledge_"):
                    knowledge_key = normalize_for_id(object_value)
                    metadata["knowledge_key"] = knowledge_key
                    store.save_dependency(chapter.chapter_id, "knowledge", knowledge_key)
                    state["knowledge_changes"].append({
                        "character_id": subject_id,
                        "change": event_type.removeprefix("knowledge_"),
                        "knowledge": object_value,
                        "type": epistemic,
                        "evidence": evidence,
                    })
                if event_type == "location":
                    state["locations"].append({
                        "character_id": subject_id, "location": object_value, "type": epistemic, "evidence": evidence
                    })
                if event_type in {"injured", "recovered"}:
                    state["injuries_and_conditions"].append({
                        "character_id": subject_id, "change": event_type, "type": epistemic, "evidence": evidence
                    })
                if event_type == "death":
                    state["deaths"].append({
                        "character_id": subject_id,
                        "type": epistemic,
                        "status": "active",
                        "evidence": evidence,
                    })
                    active_death_indexes[subject_id] = len(state["deaths"]) - 1
                elif event_type == "death_reverted":
                    prior_death_index = active_death_indexes.pop(subject_id, None)
                    if prior_death_index is not None:
                        prior_death = state["deaths"][prior_death_index]
                        prior_death["status"] = "reverted"
                        prior_death["resolution_evidence"] = evidence
                if event_type == "plot_opened":
                    state["plot_threads_opened"].append({"thread": object_value, "evidence": evidence})
                if event_type == "plot_resolved":
                    state["plot_threads_resolved"].append({"thread": object_value, "evidence": evidence})
                if event_type == "age":
                    predicate = "age"
                fact_id = _fact_id(chapter.chapter_id, paragraph.source_index, predicate, subject_id, object_value)
                confidence = 0.98 if TYPE_RE.match(paragraph.plain_text) else 0.82
                if epistemic != "FACT":
                    confidence = min(confidence, 0.7)
                    state["uncertain_facts"].append({
                        "subject_id": subject_id,
                        "predicate": predicate,
                        "value": object_value,
                        "type": epistemic,
                        "evidence": evidence,
                    })
                store.save_fact({
                    "fact_id": fact_id,
                    "chapter_id": chapter.chapter_id,
                    "source_index": paragraph.source_index,
                    "subject_id": subject_id,
                    "predicate": predicate,
                    "object_value": object_value,
                    "epistemic_type": epistemic,
                    "confidence": confidence,
                    "review_status": "candidate",
                    "line_start": line,
                    "line_end": line,
                    "source_quote": evidence["source_quote"],
                    "metadata_json": json.dumps(metadata, ensure_ascii=False, sort_keys=True),
                })
                store.save_event({
                    "event_id": _event_id(fact_id),
                    "chapter_id": chapter.chapter_id,
                    "source_index": paragraph.source_index,
                    "event_type": event_type,
                    "subject_id": item_id or subject_id,
                    "object_value": object_value,
                    "story_time": _story_time(paragraph.plain_text),
                    "relative_order": relative_order,
                    "location": object_value if event_type == "location" else "",
                    "certainty": confidence,
                    "epistemic_type": epistemic,
                    "line_start": line,
                    "line_end": line,
                    "source_quote": evidence["source_quote"],
                    "metadata_json": json.dumps(metadata, ensure_ascii=False, sort_keys=True),
                })
                state["timeline"].append({
                    "event_id": _event_id(fact_id),
                    "type": event_type,
                    "subject_id": item_id or subject_id,
                    "story_time": _story_time(paragraph.plain_text),
                    "certainty": confidence,
                    "epistemic_type": epistemic,
                    "evidence": evidence,
                })
                facts_count += 1
        previous_text.append(paragraph.plain_text)
    return AnalysisResult(state, facts_count, mention_count)
