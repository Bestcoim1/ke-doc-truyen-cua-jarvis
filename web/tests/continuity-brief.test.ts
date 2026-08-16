import { describe, expect, it } from "vitest";

import { buildContinuityBrief } from "@/lib/studio/brief";
import type { ContinuityStudioData } from "@/lib/studio/types";

const NOW = "2026-08-14T00:00:00.000Z";
const STORY_ID = "10000000-0000-4000-8000-000000000001";
const OWNER_ID = "20000000-0000-4000-8000-000000000001";
const EVE_ID = "30000000-0000-4000-8000-000000000001";
const ERIK_ID = "30000000-0000-4000-8000-000000000002";
const RULE_ID = "30000000-0000-4000-8000-000000000003";
const CHAPTER_ID = "40000000-0000-4000-8000-000000000001";
const TIMELINE_INBOX_ID = "80000000-0000-4000-8000-000000000001";
const KNOWLEDGE_INBOX_ID = "80000000-0000-4000-8000-000000000002";

function fact(
  id: string,
  entityId: string,
  statement: string,
  status: ContinuityStudioData["facts"][number]["status"],
) {
  return {
    id,
    owner_id: OWNER_ID,
    story_id: STORY_ID,
    entity_id: entityId,
    source_inbox_item_id: null,
    statement,
    status,
    created_at: NOW,
    updated_at: NOW,
  };
}

const data: ContinuityStudioData = {
  story: {
    id: STORY_ID,
    title: "Tác phẩm thử nghiệm",
    description: null,
    updatedAt: NOW,
    writingStatus: "drafting",
    coverImageUrl: null,
  },
  chapters: [{ id: CHAPTER_ID, title: "Chương 12", sortOrder: 12 }],
  entities: [
    {
      id: EVE_ID,
      owner_id: OWNER_ID,
      story_id: STORY_ID,
      kind: "character",
      name: "Eve",
      aliases: [],
      description: null,
      archived_at: null,
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: ERIK_ID,
      owner_id: OWNER_ID,
      story_id: STORY_ID,
      kind: "character",
      name: "Erik",
      aliases: [],
      description: null,
      archived_at: null,
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: RULE_ID,
      owner_id: OWNER_ID,
      story_id: STORY_ID,
      kind: "world_rule",
      name: "Luật hồi quy",
      aliases: [],
      description: null,
      archived_at: null,
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  facts: [
    fact("50000000-0000-4000-8000-000000000001", EVE_ID, "Eve bị thương ở tay trái.", "canon"),
    fact("50000000-0000-4000-8000-000000000002", EVE_ID, "Eve có thể đã biết bí mật.", "inference"),
    fact("50000000-0000-4000-8000-000000000003", EVE_ID, "Fact chưa được tác giả duyệt.", "candidate"),
    fact("50000000-0000-4000-8000-000000000004", ERIK_ID, "Erik đang ở một nơi khác.", "canon"),
    fact("50000000-0000-4000-8000-000000000005", RULE_ID, "Hồi quy giữ lại ký ức.", "disputed"),
    fact("50000000-0000-4000-8000-000000000006", RULE_ID, "Luật cũ đã bị thay thế.", "retconned"),
  ],
  evidence: [
    {
      id: "60000000-0000-4000-8000-000000000001",
      owner_id: OWNER_ID,
      story_id: STORY_ID,
      fact_id: "50000000-0000-4000-8000-000000000001",
      plot_thread_id: null,
      chapter_id: CHAPTER_ID,
      chapter_revision_id: null,
      source_anchor_id: null,
      source_kind: "direct_source",
      source_label: "Chương 12",
      start_line: 20,
      end_line: 24,
      excerpt: null,
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  threads: [
    {
      id: "70000000-0000-4000-8000-000000000001",
      owner_id: OWNER_ID,
      story_id: STORY_ID,
      thread_type: "mystery",
      title: "Ai để lại chiếc chìa khóa?",
      setup: null,
      promise: null,
      expected_payoff: null,
      notes: null,
      status: "open",
      last_touched_chapter_id: CHAPTER_ID,
      due_chapter_id: null,
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: "70000000-0000-4000-8000-000000000002",
      owner_id: OWNER_ID,
      story_id: STORY_ID,
      thread_type: "promise",
      title: "Thread đã hoàn tất",
      setup: null,
      promise: null,
      expected_payoff: null,
      notes: null,
      status: "resolved",
      last_touched_chapter_id: CHAPTER_ID,
      due_chapter_id: null,
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  analysisRuns: [],
  inboxItems: [],
  reviewedEvidence: [
    {
      id: "90000000-0000-4000-8000-000000000001",
      owner_id: OWNER_ID,
      story_id: STORY_ID,
      inbox_item_id: TIMELINE_INBOX_ID,
      chapter_id: CHAPTER_ID,
      chapter_revision_id: "a0000000-0000-4000-8000-000000000001",
      source_anchor_id: "block-7",
      source_label: "Chương 12",
      start_line: 7,
      end_line: 7,
      excerpt: "Sáng hôm sau, Eve trở lại đại sảnh.",
      created_at: NOW,
    },
    {
      id: "90000000-0000-4000-8000-000000000002",
      owner_id: OWNER_ID,
      story_id: STORY_ID,
      inbox_item_id: KNOWLEDGE_INBOX_ID,
      chapter_id: CHAPTER_ID,
      chapter_revision_id: "a0000000-0000-4000-8000-000000000001",
      source_anchor_id: "block-9",
      source_label: "Chương 12",
      start_line: 9,
      end_line: 9,
      excerpt: "Eve biết cánh cửa là giả.",
      created_at: NOW,
    },
  ],
  timelineEvents: [
    {
      id: "b0000000-0000-4000-8000-000000000001",
      owner_id: OWNER_ID,
      story_id: STORY_ID,
      source_inbox_item_id: TIMELINE_INBOX_ID,
      title: "Sáng hôm sau, Eve trở lại đại sảnh.",
      time_start: "Sáng hôm sau",
      time_end: null,
      chapter_sequence: 12,
      participant_entity_id: EVE_ID,
      location_entity_id: null,
      certainty: "canon",
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  characterKnowledge: [
    {
      id: "c0000000-0000-4000-8000-000000000001",
      owner_id: OWNER_ID,
      story_id: STORY_ID,
      source_inbox_item_id: KNOWLEDGE_INBOX_ID,
      character_entity_id: EVE_ID,
      knowledge_text: "Cánh cửa là giả.",
      knowledge_state: "knows",
      is_secret: true,
      acquired_chapter_id: CHAPTER_ID,
      chapter_sequence: 12,
      fact_id: null,
      certainty: "canon",
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  p1Available: true,
};

describe("Continuity brief", () => {
  it("includes selected facts and world rules without promoting candidates or retcons", () => {
    const brief = buildContinuityBrief(data, {
      povEntityId: EVE_ID,
      locationEntityId: null,
      characterEntityIds: [EVE_ID],
      timelineNote: "Sau Chương 12",
    });

    expect(brief.selectedEntityNames).toEqual(["Eve"]);
    expect(brief.timelineNote).toBe("Sau Chương 12");
    expect(brief.facts.map((item) => item.statement)).toEqual([
      "Eve bị thương ở tay trái.",
      "Eve có thể đã biết bí mật.",
      "Hồi quy giữ lại ký ức.",
    ]);
    expect(brief.facts[0].sourcePointers).toEqual(["Chương 12:L20–L24"]);
    expect(brief.threads.map((item) => item.title)).toEqual([
      "Ai để lại chiếc chìa khóa?",
    ]);
    expect(brief.timelineEvents.map((item) => item.title)).toEqual([
      "Sáng hôm sau, Eve trở lại đại sảnh.",
    ]);
    expect(brief.timelineEvents[0].sourcePointers).toEqual(["Chương 12:L7"]);
    expect(brief.characterKnowledge.map((item) => item.knowledge_text)).toEqual([
      "Cánh cửa là giả.",
    ]);
    expect(brief.characterKnowledge[0].sourcePointers).toEqual(["Chương 12:L9"]);
  });
});
