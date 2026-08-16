import { createHash } from "node:crypto";

import type { Json } from "@/database.types";
import type { Block } from "@/lib/reader/types";
import type {
  ContinuityAlertKind,
  ContinuityEntity,
  ContinuityInboxKind,
  ContinuityKnowledgeState,
  ContinuitySeverity,
} from "@/lib/studio/types";

export const CONTINUITY_DETECTOR_VERSION = "rules-vi-v1";
export const MAX_CANDIDATES_PER_RUN = 500;
export const MAX_ALERTS_PER_RUN = 200;

export type AnalysisChapter = {
  id: string;
  revisionId: string;
  title: string;
  sequence: number;
  blocks: Block[];
};

export type AnalysisEvidenceSeed = {
  chapterId: string | null;
  chapterRevisionId: string | null;
  sourceLabel: string;
  sourceAnchorId: string | null;
  startLine: number | null;
  endLine: number | null;
  excerpt: string | null;
};

export type AnalysisItemSeed = {
  kind: ContinuityInboxKind;
  alertKind: ContinuityAlertKind | null;
  severity: ContinuitySeverity | null;
  subjectEntityId: string | null;
  relatedEntityId: string | null;
  statement: string;
  metadata: Record<string, Json | undefined>;
  evidence: AnalysisEvidenceSeed[];
  fingerprint: string;
};

export type AcceptedAnalysisItem = {
  kind: ContinuityInboxKind;
  subjectEntityId: string | null;
  relatedEntityId: string | null;
  statement: string;
  metadata: Record<string, Json | undefined>;
  evidence: AnalysisEvidenceSeed[];
};

export type AnalysisFact = {
  id: string;
  entityId: string | null;
  statement: string;
  evidence: AnalysisEvidenceSeed[];
};

export type AnalysisKnowledge = {
  characterEntityId: string;
  knowledgeText: string;
  knowledgeState: ContinuityKnowledgeState;
  chapterSequence: number | null;
  evidence: AnalysisEvidenceSeed[];
};

export type AnalysisThread = {
  id: string;
  title: string;
  lastTouchedChapterId: string | null;
  dueChapterId: string | null;
  evidence: AnalysisEvidenceSeed[];
};

export type AlertDetectionInput = {
  candidates: AnalysisItemSeed[];
  entities: ContinuityEntity[];
  facts: AnalysisFact[];
  acceptedItems: AcceptedAnalysisItem[];
  knowledge: AnalysisKnowledge[];
  threads: AnalysisThread[];
  chapterSequenceById: Map<string, number>;
  latestChapterSequence: number;
};

type MentionMatcher = {
  entity: ContinuityEntity;
  patterns: RegExp[];
};

type StateRule = {
  key: string;
  value: string;
  label: string;
  pattern: RegExp;
};

const STATE_RULES: StateRule[] = [
  { key: "life", value: "dead", label: "đã chết", pattern: /(?:đã\s+chết|qua\s+đời|tử\s+vong|mất\s+mạng)/iu },
  { key: "life", value: "alive", label: "còn sống", pattern: /(?:còn\s+sống|sống\s+lại|hồi\s+sinh)/iu },
  { key: "condition", value: "injured", label: "bị thương", pattern: /(?:bị\s+thương|trọng\s+thương|gãy\s+(?:tay|chân)|chảy\s+máu)/iu },
  { key: "condition", value: "healthy", label: "đã hồi phục", pattern: /(?:đã\s+hồi\s+phục|lành\s+hẳn|khỏe\s+lại|bình\s+phục)/iu },
  { key: "consciousness", value: "unconscious", label: "bất tỉnh", pattern: /(?:bất\s+tỉnh|hôn\s+mê|ngất\s+đi)/iu },
  { key: "consciousness", value: "conscious", label: "đã tỉnh", pattern: /(?:tỉnh\s+lại|tỉnh\s+dậy|lấy\s+lại\s+ý\s+thức)/iu },
  { key: "availability", value: "missing", label: "mất tích", pattern: /(?:mất\s+tích|biến\s+mất|không\s+rõ\s+tung\s+tích)/iu },
  { key: "availability", value: "present", label: "đã xuất hiện", pattern: /(?:xuất\s+hiện\s+trở\s+lại|đã\s+trở\s+về|tái\s+xuất)/iu },
];

const OPPOSING_STATE = new Map([
  ["life:dead", "alive"],
  ["life:alive", "dead"],
  ["condition:injured", "healthy"],
  ["condition:healthy", "injured"],
  ["consciousness:unconscious", "conscious"],
  ["consciousness:conscious", "unconscious"],
  ["availability:missing", "present"],
  ["availability:present", "missing"],
]);

const KNOWLEDGE_CUE = /(?:\bbiết\b|nhận\s+ra|phát\s+hiện|hiểu\s+rằng|nhớ\s+rằng|nghe\s+(?:rằng|thấy)|được\s+(?:kể|báo)|ý\s+thức\s+được)/iu;
const DOES_NOT_KNOW_CUE = /(?:không|chưa)(?:\s+hề)?\s+(?:biết|nhận\s+ra|phát\s+hiện|hiểu)/iu;
const LOCATION_CUE = /(?:đến|tới|rời|trở\s+về|quay\s+về|bước\s+vào|đi\s+vào|đang\s+ở|có\s+mặt\s+tại|xuất\s+hiện\s+ở)/iu;
const POSSESSION_RULES = [
  { action: "lost", pattern: /(?:đánh\s+rơi|làm\s+mất|bị\s+lấy|không\s+còn\s+giữ)/iu },
  { action: "transferred", pattern: /(?:trao|đưa|giao|chuyển)\s+(?:cho|lại)/iu },
  { action: "acquired", pattern: /(?:nhận|lấy|nhặt|giành|đoạt|tìm\s+được)/iu },
  { action: "held", pattern: /(?:cầm|giữ|mang|sở\s+hữu|đeo)/iu },
] as const;
const TIME_CUE = /(?:sáng|trưa|chiều|tối|đêm)\s+(?:hôm\s+)?(?:nay|đó|sau|trước)?|(?:hôm|ngày|tuần|tháng|năm)\s+(?:sau|trước|đó|nay)|\b\d{1,2}\s*(?:giờ|h)\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/iu;

function normalizeText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("vi").replace(/\s+/gu, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function mentionPattern(value: string) {
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_])${escapeRegExp(value)}(?=$|[^\\p{L}\\p{N}_])`,
    "iu",
  );
}

function buildMentionMatchers(entities: ContinuityEntity[]): MentionMatcher[] {
  return entities.map((entity) => ({
    entity,
    patterns: [entity.name, ...entity.aliases]
      .map(normalizeText)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map(mentionPattern),
  }));
}

function mentionedEntities(text: string, matchers: MentionMatcher[]) {
  return matchers
    .filter((matcher) => matcher.patterns.some((pattern) => pattern.test(text)))
    .map((matcher) => matcher.entity);
}

function hasNegationImmediatelyBefore(text: string, index: number) {
  const prefix = text.slice(Math.max(0, index - 18), index);
  return /(?:không|chưa|chẳng|chả)\s*$/iu.test(prefix);
}

function matchStateRules(text: string) {
  return STATE_RULES.filter((rule) => {
    const match = rule.pattern.exec(text);
    return match && !hasNegationImmediatelyBefore(text, match.index);
  });
}

function firstMatch(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  return match?.[0]?.trim() ?? null;
}

function paragraphEvidence(
  chapter: AnalysisChapter,
  block: Block,
  line: number,
  excerpt: string,
): AnalysisEvidenceSeed {
  return {
    chapterId: chapter.id,
    chapterRevisionId: chapter.revisionId,
    sourceLabel: chapter.title,
    sourceAnchorId: block.anchor_id,
    startLine: line,
    endLine: line,
    excerpt,
  };
}

function fingerprint(parts: Array<string | number | null | undefined>) {
  return createHash("sha256").update(parts.map((part) => part ?? "").join("\u001f")).digest("hex");
}

function createSeed(input: Omit<AnalysisItemSeed, "fingerprint">) {
  return {
    ...input,
    fingerprint: fingerprint([
      input.kind,
      input.alertKind,
      input.subjectEntityId,
      input.relatedEntityId,
      input.statement,
      input.evidence[0]?.chapterRevisionId,
      input.evidence[0]?.startLine,
    ]),
  } satisfies AnalysisItemSeed;
}

export function extractContinuityCandidates(
  chapters: AnalysisChapter[],
  entities: ContinuityEntity[],
) {
  const matchers = buildMentionMatchers(entities);
  const candidates: AnalysisItemSeed[] = [];

  for (const chapter of chapters) {
    for (let blockIndex = 0; blockIndex < chapter.blocks.length; blockIndex += 1) {
      if (candidates.length >= MAX_CANDIDATES_PER_RUN) return candidates;
      const block = chapter.blocks[blockIndex];
      if (block.type !== "paragraph") continue;
      const statement = block.text.trim().slice(0, 4000);
      if (!statement) continue;
      const normalized = normalizeText(statement);
      const mentions = mentionedEntities(normalized, matchers);
      const line = blockIndex + 1;
      const evidence = [paragraphEvidence(chapter, block, line, statement)];
      const timeLabel = firstMatch(normalized, TIME_CUE);
      const sharedMetadata = {
        detectorVersion: CONTINUITY_DETECTOR_VERSION,
        chapterSequence: chapter.sequence,
      };
      if (mentions.length === 0) {
        if (timeLabel) {
          candidates.push(
            createSeed({
              kind: "timeline_event",
              alertKind: null,
              severity: null,
              subjectEntityId: null,
              relatedEntityId: null,
              statement,
              metadata: { ...sharedMetadata, timeLabel },
              evidence,
            }),
          );
        }
        continue;
      }

      const characters = mentions.filter((entity) => entity.kind === "character");
      const locations = mentions.filter((entity) => entity.kind === "location");
      const items = mentions.filter((entity) => entity.kind === "item");
      const subject = characters[0] ?? mentions[0];

      for (const character of characters) {
        for (const rule of matchStateRules(normalized)) {
          candidates.push(
            createSeed({
              kind: "state_change",
              alertKind: null,
              severity: null,
              subjectEntityId: character.id,
              relatedEntityId: null,
              statement,
              metadata: {
                ...sharedMetadata,
                stateKey: rule.key,
                stateValue: rule.value,
                stateLabel: rule.label,
              },
              evidence,
            }),
          );
          if (candidates.length >= MAX_CANDIDATES_PER_RUN) return candidates;
        }
      }

      if (characters[0] && KNOWLEDGE_CUE.test(normalized)) {
        candidates.push(
          createSeed({
            kind: "knowledge_claim",
            alertKind: null,
            severity: null,
            subjectEntityId: characters[0].id,
            relatedEntityId: null,
            statement,
            metadata: {
              ...sharedMetadata,
              suggestedKnowledgeState: DOES_NOT_KNOW_CUE.test(normalized)
                ? "does_not_know"
                : "knows",
              isSecret: true,
            },
            evidence,
          }),
        );
      }

      if (characters[0] && locations[0] && LOCATION_CUE.test(normalized)) {
        candidates.push(
          createSeed({
            kind: "location_change",
            alertKind: null,
            severity: null,
            subjectEntityId: characters[0].id,
            relatedEntityId: locations[0].id,
            statement,
            metadata: {
              ...sharedMetadata,
              stateKey: "location",
              stateValue: locations[0].id,
              timeLabel: firstMatch(normalized, TIME_CUE),
            },
            evidence,
          }),
        );
      }

      if (characters[0] && items[0]) {
        const possession = POSSESSION_RULES.find((rule) => rule.pattern.test(normalized));
        if (possession) {
          candidates.push(
            createSeed({
              kind: "possession_change",
              alertKind: null,
              severity: null,
              subjectEntityId: characters[0].id,
              relatedEntityId: items[0].id,
              statement,
              metadata: {
                ...sharedMetadata,
                stateKey: "possession",
                stateValue: items[0].id,
                possessionAction: possession.action,
              },
              evidence,
            }),
          );
        }
      }

      if (timeLabel) {
        candidates.push(
          createSeed({
            kind: "timeline_event",
            alertKind: null,
            severity: null,
            subjectEntityId: subject?.id ?? null,
            relatedEntityId: locations[0]?.id ?? null,
            statement,
            metadata: { ...sharedMetadata, timeLabel },
            evidence,
          }),
        );
      }
    }
  }

  return candidates.slice(0, MAX_CANDIDATES_PER_RUN);
}

function metadataString(metadata: Record<string, Json | undefined>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function metadataNumber(metadata: Record<string, Json | undefined>, key: string) {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function contentWords(value: string) {
  const stop = new Set([
    "của", "và", "là", "đã", "đang", "được", "một", "những", "các",
    "rằng", "thì", "mà", "với", "trong", "không", "chưa", "biết",
  ]);
  return new Set(
    normalizeText(value)
      .split(/[^\p{L}\p{N}_]+/u)
      .filter((word) => word.length >= 3 && !stop.has(word)),
  );
}

function textSimilarity(left: string, right: string) {
  const a = contentWords(left);
  const b = contentWords(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

function entityName(entities: Map<string, ContinuityEntity>, id: string | null) {
  return id ? (entities.get(id)?.name ?? "Thực thể đã lưu trữ") : "Thực thể chưa rõ";
}

function alertSeed(input: {
  alertKind: ContinuityAlertKind;
  severity: ContinuitySeverity;
  subjectEntityId: string | null;
  relatedEntityId?: string | null;
  statement: string;
  metadata?: Record<string, Json | undefined>;
  evidence: AnalysisEvidenceSeed[];
}) {
  return createSeed({
    kind: "alert",
    alertKind: input.alertKind,
    severity: input.severity,
    subjectEntityId: input.subjectEntityId,
    relatedEntityId: input.relatedEntityId ?? null,
    statement: input.statement,
    metadata: {
      detectorVersion: CONTINUITY_DETECTOR_VERSION,
      ...(input.metadata ?? {}),
    },
    evidence: input.evidence,
  });
}

export function detectContinuityAlerts(input: AlertDetectionInput) {
  const alerts: AnalysisItemSeed[] = [];
  const entities = new Map(input.entities.map((entity) => [entity.id, entity]));

  for (const candidate of input.candidates) {
    if (alerts.length >= MAX_ALERTS_PER_RUN) break;
    if (candidate.kind !== "state_change" || !candidate.subjectEntityId) continue;
    const stateKey = metadataString(candidate.metadata, "stateKey");
    const stateValue = metadataString(candidate.metadata, "stateValue");
    if (!stateKey || !stateValue) continue;
    const opposite = OPPOSING_STATE.get(`${stateKey}:${stateValue}`);
    if (!opposite) continue;

    for (const fact of input.facts) {
      if (fact.entityId !== candidate.subjectEntityId) continue;
      const factStates = matchStateRules(normalizeText(fact.statement));
      if (!factStates.some((rule) => rule.key === stateKey && rule.value === opposite)) continue;
      alerts.push(
        alertSeed({
          alertKind: "state_conflict",
          severity: "major",
          subjectEntityId: candidate.subjectEntityId,
          statement: `${entityName(entities, candidate.subjectEntityId)} có trạng thái mới cần đối chiếu với fact hiện hành: “${fact.statement.slice(0, 500)}”.`,
          metadata: { candidateFingerprint: candidate.fingerprint, factId: fact.id },
          evidence: [...candidate.evidence, ...fact.evidence],
        }),
      );
      break;
    }
  }

  const previousLocations = input.acceptedItems.filter(
    (item) => item.kind === "location_change" && item.subjectEntityId && item.relatedEntityId,
  );
  for (const candidate of input.candidates) {
    if (alerts.length >= MAX_ALERTS_PER_RUN) break;
    if (candidate.kind !== "location_change" || !candidate.subjectEntityId || !candidate.relatedEntityId) continue;
    const sequence = metadataNumber(candidate.metadata, "chapterSequence");
    const timeLabel = metadataString(candidate.metadata, "timeLabel");
    if (sequence === null) continue;
    const previous = previousLocations.find((item) => {
      const previousSequence = metadataNumber(item.metadata, "chapterSequence");
      const previousTime = metadataString(item.metadata, "timeLabel");
      return (
        item.subjectEntityId === candidate.subjectEntityId &&
        item.relatedEntityId !== candidate.relatedEntityId &&
        previousSequence !== null &&
        Math.abs(sequence - previousSequence) <= 1 &&
        (sequence === previousSequence || (timeLabel !== null && timeLabel === previousTime))
      );
    });
    if (!previous) continue;
    alerts.push(
      alertSeed({
        alertKind: "impossible_travel",
        severity: "moderate",
        subjectEntityId: candidate.subjectEntityId,
        relatedEntityId: candidate.relatedEntityId,
        statement: `${entityName(entities, candidate.subjectEntityId)} xuất hiện gần như đồng thời tại ${entityName(entities, previous.relatedEntityId)} và ${entityName(entities, candidate.relatedEntityId)}. Hãy kiểm tra thời gian di chuyển hoặc mốc cảnh.`,
        metadata: { candidateFingerprint: candidate.fingerprint },
        evidence: [...previous.evidence, ...candidate.evidence],
      }),
    );
  }

  for (const candidate of input.candidates) {
    if (alerts.length >= MAX_ALERTS_PER_RUN) break;
    if (candidate.kind !== "knowledge_claim" || !candidate.subjectEntityId) continue;
    const sequence = metadataNumber(candidate.metadata, "chapterSequence");
    if (sequence === null) continue;
    const conflict = input.knowledge.find((record) => {
      if (record.characterEntityId !== candidate.subjectEntityId) return false;
      if (textSimilarity(record.knowledgeText, candidate.statement) < 0.45) return false;
      if (record.knowledgeState === "does_not_know") {
        return record.chapterSequence === null || sequence <= record.chapterSequence;
      }
      return record.knowledgeState === "knows" && record.chapterSequence !== null && sequence < record.chapterSequence;
    });
    if (!conflict) continue;
    alerts.push(
      alertSeed({
        alertKind: "premature_knowledge",
        severity: "major",
        subjectEntityId: candidate.subjectEntityId,
        statement: `${entityName(entities, candidate.subjectEntityId)} có vẻ biết thông tin trước mốc đã được tác giả ghi nhận. Có thể đây là nguồn biết khác, POV không đáng tin hoặc rủi ro continuity.`,
        metadata: { candidateFingerprint: candidate.fingerprint },
        evidence: [...conflict.evidence, ...candidate.evidence],
      }),
    );
  }

  const heldItems = input.acceptedItems.filter((item) => {
    if (item.kind !== "possession_change" || !item.subjectEntityId || !item.relatedEntityId) return false;
    const action = metadataString(item.metadata, "possessionAction");
    return action === "held" || action === "acquired";
  });
  for (const candidate of input.candidates) {
    if (alerts.length >= MAX_ALERTS_PER_RUN) break;
    if (candidate.kind !== "possession_change" || !candidate.subjectEntityId || !candidate.relatedEntityId) continue;
    const action = metadataString(candidate.metadata, "possessionAction");
    if (action !== "held" && action !== "acquired") continue;
    const sequence = metadataNumber(candidate.metadata, "chapterSequence");
    const previous = heldItems.find((item) => {
      const previousSequence = metadataNumber(item.metadata, "chapterSequence");
      return (
        item.relatedEntityId === candidate.relatedEntityId &&
        item.subjectEntityId !== candidate.subjectEntityId &&
        sequence !== null &&
        previousSequence !== null &&
        Math.abs(sequence - previousSequence) <= 1
      );
    });
    if (!previous) continue;
    alerts.push(
      alertSeed({
        alertKind: "duplicate_item",
        severity: "moderate",
        subjectEntityId: candidate.subjectEntityId,
        relatedEntityId: candidate.relatedEntityId,
        statement: `${entityName(entities, candidate.relatedEntityId)} dường như do cả ${entityName(entities, previous.subjectEntityId)} và ${entityName(entities, candidate.subjectEntityId)} nắm giữ ở các mốc rất gần nhau. Hãy kiểm tra cảnh trao đổi hoặc bản sao của vật phẩm.`,
        metadata: { candidateFingerprint: candidate.fingerprint },
        evidence: [...previous.evidence, ...candidate.evidence],
      }),
    );
  }

  for (const thread of input.threads) {
    if (alerts.length >= MAX_ALERTS_PER_RUN) break;
    const lastTouched = thread.lastTouchedChapterId
      ? input.chapterSequenceById.get(thread.lastTouchedChapterId)
      : undefined;
    const due = thread.dueChapterId
      ? input.chapterSequenceById.get(thread.dueChapterId)
      : undefined;
    const overdue = due !== undefined && due < input.latestChapterSequence;
    const untouchedGap = lastTouched === undefined
      ? input.latestChapterSequence + 1
      : input.latestChapterSequence - lastTouched;
    if (!overdue && untouchedGap < 5) continue;
    alerts.push(
      alertSeed({
        alertKind: "forgotten_thread",
        severity: overdue ? "major" : "moderate",
        subjectEntityId: null,
        statement: `Plot thread “${thread.title}” ${overdue ? "đã qua chương payoff dự kiến" : `chưa được chạm tới trong ${untouchedGap} chương`}. Đây là lời nhắc duyệt, không phải kết luận thread đã bị bỏ quên.`,
        metadata: { threadId: thread.id, untouchedGap, overdue },
        evidence: thread.evidence,
      }),
    );
  }

  const unique = new Map<string, AnalysisItemSeed>();
  for (const alert of alerts) unique.set(alert.fingerprint, alert);
  return [...unique.values()].slice(0, MAX_ALERTS_PER_RUN);
}
