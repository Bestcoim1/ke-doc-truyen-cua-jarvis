import type {
  ContinuityEvidence,
  ContinuityFact,
  ContinuityInboxEvidence,
  ContinuityPlotThread,
  ContinuityStudioData,
} from "@/lib/studio/types";

const BRIEF_FACT_STATUSES = new Set(["canon", "inference", "disputed"]);
const ACTIVE_THREAD_STATUSES = new Set([
  "open",
  "progressing",
  "apparently_dropped",
]);

export type ContinuityBriefSelection = {
  povEntityId: string | null;
  locationEntityId: string | null;
  characterEntityIds: string[];
  timelineNote: string;
};

export type BriefFact = ContinuityFact & {
  entityName: string;
  sourcePointers: string[];
};

export type BriefThread = ContinuityPlotThread & {
  sourcePointers: string[];
};

export type BriefTimelineEvent = ContinuityStudioData["timelineEvents"][number] & {
  participantName: string | null;
  locationName: string | null;
  sourcePointers: string[];
};

export type BriefKnowledge = ContinuityStudioData["characterKnowledge"][number] & {
  characterName: string;
  sourcePointers: string[];
};

export type ContinuityBrief = {
  selectedEntityNames: string[];
  timelineNote: string;
  facts: BriefFact[];
  threads: BriefThread[];
  timelineEvents: BriefTimelineEvent[];
  characterKnowledge: BriefKnowledge[];
};

function sourcePointer(
  evidence: ContinuityEvidence,
  chapterTitleById: Map<string, string>,
) {
  const chapterTitle = evidence.chapter_id
    ? chapterTitleById.get(evidence.chapter_id)
    : null;
  const label = chapterTitle ?? evidence.source_label ?? "Nguồn chưa đặt tên";
  if (evidence.start_line === null) return label;
  const end = evidence.end_line ?? evidence.start_line;
  return `${label}:L${evidence.start_line}${end > evidence.start_line ? `–L${end}` : ""}`;
}

function inboxSourcePointer(
  evidence: ContinuityInboxEvidence,
  chapterTitleById: Map<string, string>,
) {
  const chapterTitle = evidence.chapter_id
    ? chapterTitleById.get(evidence.chapter_id)
    : null;
  const label = chapterTitle ?? evidence.source_label;
  if (evidence.start_line === null) return label;
  const end = evidence.end_line ?? evidence.start_line;
  return `${label}:L${evidence.start_line}${end > evidence.start_line ? `–L${end}` : ""}`;
}

function evidencePointers(
  evidence: ContinuityEvidence[],
  chapterTitleById: Map<string, string>,
  parent: { factId?: string; threadId?: string },
) {
  return evidence
    .filter((item) =>
      parent.factId
        ? item.fact_id === parent.factId
        : item.plot_thread_id === parent.threadId,
    )
    .map((item) => sourcePointer(item, chapterTitleById));
}

export function buildContinuityBrief(
  data: ContinuityStudioData,
  selection: ContinuityBriefSelection,
): ContinuityBrief {
  const entityById = new Map(data.entities.map((entity) => [entity.id, entity]));
  const chapterTitleById = new Map(
    data.chapters.map((chapter) => [chapter.id, chapter.title]),
  );
  const selectedIds = new Set(
    [
      selection.povEntityId,
      selection.locationEntityId,
      ...selection.characterEntityIds,
    ].filter((value): value is string => Boolean(value)),
  );

  const selectedEntityNames = [...selectedIds]
    .map((id) => entityById.get(id)?.name)
    .filter((name): name is string => Boolean(name));
  const selectedCharacterIds = new Set(
    [selection.povEntityId, ...selection.characterEntityIds].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const reviewedEvidenceByItem = new Map<string, ContinuityInboxEvidence[]>();
  for (const evidence of data.reviewedEvidence) {
    const list = reviewedEvidenceByItem.get(evidence.inbox_item_id) ?? [];
    list.push(evidence);
    reviewedEvidenceByItem.set(evidence.inbox_item_id, list);
  }

  const facts = data.facts
    .filter((fact) => {
      if (!BRIEF_FACT_STATUSES.has(fact.status)) return false;
      if (fact.entity_id === null) return true;
      const entity = entityById.get(fact.entity_id);
      return selectedIds.has(fact.entity_id) || entity?.kind === "world_rule";
    })
    .map((fact) => ({
      ...fact,
      entityName: fact.entity_id
        ? (entityById.get(fact.entity_id)?.name ?? "Thực thể đã lưu trữ")
        : "Toàn tác phẩm",
      sourcePointers: evidencePointers(data.evidence, chapterTitleById, {
        factId: fact.id,
      }),
    }));

  const threads = data.threads
    .filter((thread) => ACTIVE_THREAD_STATUSES.has(thread.status))
    .map((thread) => ({
      ...thread,
      sourcePointers: evidencePointers(data.evidence, chapterTitleById, {
        threadId: thread.id,
      }),
    }));

  const timelineEvents = data.timelineEvents
    .filter((event) => {
      if (!event.participant_entity_id && !event.location_entity_id) return true;
      return (
        (event.participant_entity_id !== null && selectedIds.has(event.participant_entity_id)) ||
        (event.location_entity_id !== null && selectedIds.has(event.location_entity_id))
      );
    })
    .map((event) => ({
      ...event,
      participantName: event.participant_entity_id
        ? (entityById.get(event.participant_entity_id)?.name ?? "Thực thể đã lưu trữ")
        : null,
      locationName: event.location_entity_id
        ? (entityById.get(event.location_entity_id)?.name ?? "Địa điểm đã lưu trữ")
        : null,
      sourcePointers: (reviewedEvidenceByItem.get(event.source_inbox_item_id) ?? []).map(
        (item) => inboxSourcePointer(item, chapterTitleById),
      ),
    }));

  const characterKnowledge = data.characterKnowledge
    .filter((record) => selectedCharacterIds.has(record.character_entity_id))
    .map((record) => ({
      ...record,
      characterName:
        entityById.get(record.character_entity_id)?.name ?? "Nhân vật đã lưu trữ",
      sourcePointers: (reviewedEvidenceByItem.get(record.source_inbox_item_id) ?? []).map(
        (item) => inboxSourcePointer(item, chapterTitleById),
      ),
    }));

  return {
    selectedEntityNames,
    timelineNote: selection.timelineNote.trim().slice(0, 500),
    facts,
    threads,
    timelineEvents,
    characterKnowledge,
  };
}
