import { describe, expect, it } from "vitest";

import {
  detectContinuityAlerts,
  extractContinuityCandidates,
  type AcceptedAnalysisItem,
  type AnalysisEvidenceSeed,
} from "@/lib/studio/automation";
import type { ContinuityEntity } from "@/lib/studio/types";

const NOW = "2026-08-14T00:00:00.000Z";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const STORY_ID = "20000000-0000-4000-8000-000000000001";
const EVE_ID = "30000000-0000-4000-8000-000000000001";
const ERIK_ID = "30000000-0000-4000-8000-000000000002";
const HALL_ID = "30000000-0000-4000-8000-000000000003";
const CELLAR_ID = "30000000-0000-4000-8000-000000000004";
const KEY_ID = "30000000-0000-4000-8000-000000000005";
const CHAPTER_ID = "40000000-0000-4000-8000-000000000001";
const REVISION_ID = "50000000-0000-4000-8000-000000000001";

function entity(
  id: string,
  kind: ContinuityEntity["kind"],
  name: string,
): ContinuityEntity {
  return {
    id,
    owner_id: OWNER_ID,
    story_id: STORY_ID,
    kind,
    name,
    aliases: [],
    description: null,
    archived_at: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

const entities = [
  entity(EVE_ID, "character", "Eve"),
  entity(ERIK_ID, "character", "Erik"),
  entity(HALL_ID, "location", "Đại sảnh"),
  entity(CELLAR_ID, "location", "Hầm ngục"),
  entity(KEY_ID, "item", "Chìa khóa"),
];

const priorEvidence: AnalysisEvidenceSeed = {
  chapterId: CHAPTER_ID,
  chapterRevisionId: "50000000-0000-4000-8000-000000000000",
  sourceLabel: "Chương 11",
  sourceAnchorId: "block-prior",
  startLine: 4,
  endLine: 4,
  excerpt: "Nguồn đã được tác giả duyệt.",
};

function acceptedItem(
  input: Omit<AcceptedAnalysisItem, "evidence" | "statement"> & {
    statement?: string;
  },
): AcceptedAnalysisItem {
  return {
    statement: input.statement ?? "Bản ghi đã duyệt.",
    evidence: [priorEvidence],
    ...input,
  };
}

describe("Continuity automation", () => {
  it("extracts review candidates with stable chapter, revision, anchor, and line evidence", () => {
    const candidates = extractContinuityCandidates(
      [
        {
          id: CHAPTER_ID,
          revisionId: REVISION_ID,
          title: "Chương 12",
          sequence: 12,
          blocks: [
            { anchor_id: "block-1", type: "paragraph", text: "Eve bị thương ở tay trái.", marks: [] },
            { anchor_id: "block-2", type: "paragraph", text: "Sáng hôm sau Eve đến Đại sảnh.", marks: [] },
            { anchor_id: "block-3", type: "paragraph", text: "Eve biết bí mật của cánh cửa.", marks: [] },
            { anchor_id: "block-4", type: "paragraph", text: "Eve cầm Chìa khóa.", marks: [] },
          ],
        },
      ],
      entities,
    );

    expect(new Set(candidates.map((candidate) => candidate.kind))).toEqual(
      new Set([
        "state_change",
        "location_change",
        "knowledge_claim",
        "possession_change",
        "timeline_event",
      ]),
    );
    expect(candidates.every((candidate) => candidate.kind !== "alert")).toBe(true);
    expect(candidates.every((candidate) => candidate.fingerprint.length === 64)).toBe(true);
    expect(candidates.flatMap((candidate) => candidate.evidence)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chapterId: CHAPTER_ID,
          chapterRevisionId: REVISION_ID,
          sourceAnchorId: "block-3",
          startLine: 3,
          endLine: 3,
        }),
      ]),
    );
  });

  it("raises all five P1 risks as evidence-backed review alerts", () => {
    const candidates = extractContinuityCandidates(
      [
        {
          id: CHAPTER_ID,
          revisionId: REVISION_ID,
          title: "Chương 12",
          sequence: 12,
          blocks: [
            { anchor_id: "block-1", type: "paragraph", text: "Eve bị thương ở tay trái.", marks: [] },
            { anchor_id: "block-2", type: "paragraph", text: "Sáng hôm sau Eve đến Đại sảnh.", marks: [] },
            { anchor_id: "block-3", type: "paragraph", text: "Eve biết bí mật của cánh cửa.", marks: [] },
            { anchor_id: "block-4", type: "paragraph", text: "Eve cầm Chìa khóa.", marks: [] },
          ],
        },
      ],
      entities,
    );
    const alerts = detectContinuityAlerts({
      candidates,
      entities,
      facts: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          entityId: EVE_ID,
          statement: "Eve đã hồi phục hoàn toàn.",
          evidence: [priorEvidence],
        },
      ],
      acceptedItems: [
        acceptedItem({
          kind: "location_change",
          subjectEntityId: EVE_ID,
          relatedEntityId: CELLAR_ID,
          metadata: { chapterSequence: 12, timeLabel: "sáng hôm sau" },
        }),
        acceptedItem({
          kind: "possession_change",
          subjectEntityId: ERIK_ID,
          relatedEntityId: KEY_ID,
          metadata: { chapterSequence: 12, possessionAction: "held" },
        }),
      ],
      knowledge: [
        {
          characterEntityId: EVE_ID,
          knowledgeText: "Bí mật của cánh cửa.",
          knowledgeState: "does_not_know",
          chapterSequence: 12,
          evidence: [priorEvidence],
        },
      ],
      threads: [
        {
          id: "70000000-0000-4000-8000-000000000001",
          title: "Ai để lại chiếc chìa khóa?",
          lastTouchedChapterId: "40000000-0000-4000-8000-000000000000",
          dueChapterId: null,
          evidence: [priorEvidence],
        },
      ],
      chapterSequenceById: new Map([
        ["40000000-0000-4000-8000-000000000000", 2],
        [CHAPTER_ID, 12],
      ]),
      latestChapterSequence: 12,
    });

    expect(new Set(alerts.map((alert) => alert.alertKind))).toEqual(
      new Set([
        "state_conflict",
        "impossible_travel",
        "premature_knowledge",
        "duplicate_item",
        "forgotten_thread",
      ]),
    );
    expect(alerts.every((alert) => alert.kind === "alert")).toBe(true);
    expect(alerts.every((alert) => alert.evidence.length > 0)).toBe(true);
    expect(alerts.flatMap((alert) => alert.evidence)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chapterRevisionId: REVISION_ID }),
        expect.objectContaining({ sourceLabel: "Chương 11" }),
      ]),
    );
  });
});
