import { describe, expect, it } from "vitest";

import {
  createTestClient,
  USER_A_EMAIL,
  USER_A_PASSWORD,
  USER_B_EMAIL,
  USER_B_PASSWORD,
} from "./env";

describe("Continuity Studio RLS", () => {
  it("keeps entities, facts, evidence, and plot threads owner-only", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();
    const [{ data: authA }, { data: authB }] = await Promise.all([
      clientA.auth.signInWithPassword({ email: USER_A_EMAIL, password: USER_A_PASSWORD }),
      clientB.auth.signInWithPassword({ email: USER_B_EMAIL, password: USER_B_PASSWORD }),
    ]);
    const ownerA = authA.user!.id;
    const ownerB = authB.user!.id;

    const { data: story, error: storyError } = await clientA
      .from("stories")
      .insert({ owner_id: ownerA, title: `Continuity RLS ${crypto.randomUUID()}` })
      .select("id")
      .single();
    expect(storyError).toBeNull();
    const storyId = story!.id;

    try {
      const { data: entity, error: entityError } = await clientA
        .from("continuity_entities")
        .insert({
          owner_id: ownerA,
          story_id: storyId,
          kind: "character",
          name: "Nhân vật được bảo vệ",
        })
        .select("id")
        .single();
      expect(entityError).toBeNull();

      const { data: fact, error: factError } = await clientA
        .from("continuity_facts")
        .insert({
          owner_id: ownerA,
          story_id: storyId,
          entity_id: entity!.id,
          statement: "Fact riêng của tác giả A",
          status: "canon",
        })
        .select("id")
        .single();
      expect(factError).toBeNull();

      const { data: thread, error: threadError } = await clientA
        .from("continuity_plot_threads")
        .insert({
          owner_id: ownerA,
          story_id: storyId,
          thread_type: "mystery",
          title: "Bí ẩn riêng của tác giả A",
        })
        .select("id")
        .single();
      expect(threadError).toBeNull();

      const { error: evidenceError } = await clientA
        .from("continuity_evidence")
        .insert([
          {
            owner_id: ownerA,
            story_id: storyId,
            fact_id: fact!.id,
            source_kind: "author_document",
            source_label: "Story Bible riêng",
          },
          {
            owner_id: ownerA,
            story_id: storyId,
            plot_thread_id: thread!.id,
            source_kind: "suggestion",
            source_label: "Dàn ý riêng",
          },
        ]);
      expect(evidenceError).toBeNull();

      for (const table of [
        "continuity_entities",
        "continuity_facts",
        "continuity_plot_threads",
        "continuity_evidence",
      ] as const) {
        const { data, error } = await clientB.from(table).select("id").eq("story_id", storyId);
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      }

      const { data: stolen, error: stolenError } = await clientB
        .from("continuity_entities")
        .insert({
          owner_id: ownerB,
          story_id: storyId,
          kind: "character",
          name: "Không được phép",
        })
        .select("id");
      expect(stolen ?? []).toHaveLength(0);
      expect(stolenError).not.toBeNull();

      const { data: updatedByB, error: updateError } = await clientB
        .from("continuity_facts")
        .update({ statement: "Bị chiếm quyền" })
        .eq("id", fact!.id)
        .select("id");
      expect(updateError).toBeNull();
      expect(updatedByB ?? []).toHaveLength(0);
    } finally {
      await clientA.from("stories").delete().eq("id", storyId);
    }
  });

  it("keeps P1 automation owner-only and promotes reviews atomically", async () => {
    const clientA = createTestClient();
    const clientB = createTestClient();
    const [{ data: authA }, { data: authB }] = await Promise.all([
      clientA.auth.signInWithPassword({ email: USER_A_EMAIL, password: USER_A_PASSWORD }),
      clientB.auth.signInWithPassword({ email: USER_B_EMAIL, password: USER_B_PASSWORD }),
    ]);
    const ownerA = authA.user!.id;
    const ownerB = authB.user!.id;

    const { data: story, error: storyError } = await clientA
      .from("stories")
      .insert({ owner_id: ownerA, title: `Continuity P1 RLS ${crypto.randomUUID()}` })
      .select("id")
      .single();
    expect(storyError).toBeNull();
    const storyId = story!.id;

    try {
      const { data: job, error: jobError } = await clientA
        .from("import_jobs")
        .insert({
          owner_id: ownerA,
          story_id: storyId,
          source_type: "paste",
          parser_version: "continuity-test-v1",
          status: "needs_review",
          draft_json: { sections: [] },
        })
        .select("id")
        .single();
      expect(jobError).toBeNull();

      const { data: version, error: versionError } = await clientA
        .from("story_versions")
        .insert({
          story_id: storyId,
          import_job_id: job!.id,
          version_number: 1,
          parser_version: "continuity-test-v1",
        })
        .select("id")
        .single();
      expect(versionError).toBeNull();

      const { data: entityRows, error: entityError } = await clientA
        .from("continuity_entities")
        .insert([
          { owner_id: ownerA, story_id: storyId, kind: "character", name: "Eve" },
          { owner_id: ownerA, story_id: storyId, kind: "location", name: "Đại sảnh" },
        ])
        .select("id, kind");
      expect(entityError).toBeNull();
      const characterId = entityRows!.find((row) => row.kind === "character")!.id;
      const locationId = entityRows!.find((row) => row.kind === "location")!.id;

      const { data: oldFact, error: oldFactError } = await clientA
        .from("continuity_facts")
        .insert({
          owner_id: ownerA,
          story_id: storyId,
          entity_id: characterId,
          statement: "Eve đã hồi phục hoàn toàn.",
          status: "canon",
        })
        .select("id")
        .single();
      expect(oldFactError).toBeNull();

      const { data: run, error: runError } = await clientA
        .from("continuity_analysis_runs")
        .insert({
          owner_id: ownerA,
          story_id: storyId,
          version_id: version!.id,
          import_job_id: job!.id,
          status: "completed",
          detector_version: "continuity-test-v1",
        })
        .select("id")
        .single();
      expect(runError).toBeNull();

      const { data: items, error: itemsError } = await clientA
        .from("continuity_inbox_items")
        .insert([
          {
            owner_id: ownerA,
            story_id: storyId,
            run_id: run!.id,
            kind: "state_change",
            subject_entity_id: characterId,
            statement: "Eve bị thương ở tay trái.",
            metadata: { chapterSequence: 12, stateKey: "condition", stateValue: "injured" },
            fingerprint: "a".repeat(64),
          },
          {
            owner_id: ownerA,
            story_id: storyId,
            run_id: run!.id,
            kind: "knowledge_claim",
            subject_entity_id: characterId,
            statement: "Eve biết bí mật của cánh cửa.",
            metadata: { chapterSequence: 12, isSecret: true },
            fingerprint: "b".repeat(64),
          },
          {
            owner_id: ownerA,
            story_id: storyId,
            run_id: run!.id,
            kind: "timeline_event",
            subject_entity_id: characterId,
            related_entity_id: locationId,
            statement: "Sáng hôm sau Eve đến Đại sảnh.",
            metadata: { chapterSequence: 12, timeLabel: "sáng hôm sau" },
            fingerprint: "c".repeat(64),
          },
          {
            owner_id: ownerA,
            story_id: storyId,
            run_id: run!.id,
            kind: "alert",
            alert_kind: "state_conflict",
            severity: "major",
            subject_entity_id: characterId,
            statement: "Trạng thái mới xung đột với fact hiện hành.",
            metadata: { factId: oldFact!.id },
            fingerprint: "d".repeat(64),
          },
        ])
        .select("id, kind");
      expect(itemsError).toBeNull();
      const itemByKind = new Map(items!.map((item) => [item.kind, item.id]));

      const { error: evidenceError } = await clientA
        .from("continuity_inbox_evidence")
        .insert(
          items!.map((item, index) => ({
            owner_id: ownerA,
            story_id: storyId,
            inbox_item_id: item.id,
            source_label: "Chương kiểm thử",
            source_anchor_id: `block-${index + 1}`,
            start_line: index + 1,
            end_line: index + 1,
            excerpt: "Nguồn kiểm thử có line ổn định.",
          })),
        );
      expect(evidenceError).toBeNull();

      const deniedReview = await clientB.rpc("review_continuity_inbox_item", {
        p_item_id: itemByKind.get("state_change")!,
        p_decision: "accepted",
        p_record_status: "canon",
      });
      expect(deniedReview.error).not.toBeNull();

      const stateReview = await clientA.rpc("review_continuity_inbox_item", {
        p_item_id: itemByKind.get("state_change")!,
        p_decision: "accepted",
        p_record_status: "inference",
      });
      expect(stateReview.error).toBeNull();
      expect(stateReview.data?.[0].fact_id).toBeTruthy();

      const repeatedStateReview = await clientA.rpc("review_continuity_inbox_item", {
        p_item_id: itemByKind.get("state_change")!,
        p_decision: "accepted",
        p_record_status: "canon",
      });
      expect(repeatedStateReview.error).toBeNull();
      expect(repeatedStateReview.data?.[0].fact_id).toBe(stateReview.data?.[0].fact_id);

      const knowledgeReview = await clientA.rpc("review_continuity_inbox_item", {
        p_item_id: itemByKind.get("knowledge_claim")!,
        p_decision: "accepted",
        p_record_status: "canon",
        p_knowledge_state: "knows",
      });
      expect(knowledgeReview.error).toBeNull();
      expect(knowledgeReview.data?.[0].knowledge_id).toBeTruthy();

      const timelineReview = await clientA.rpc("review_continuity_inbox_item", {
        p_item_id: itemByKind.get("timeline_event")!,
        p_decision: "accepted",
        p_record_status: "disputed",
      });
      expect(timelineReview.error).toBeNull();
      expect(timelineReview.data?.[0].timeline_event_id).toBeTruthy();

      const retconReview = await clientA.rpc("review_continuity_inbox_item", {
        p_item_id: itemByKind.get("alert")!,
        p_decision: "retcon",
      });
      expect(retconReview.error).toBeNull();
      expect(retconReview.data?.[0].fact_id).toBe(oldFact!.id);

      const [{ data: promotedFact }, { data: knowledge }, { data: timeline }, { data: supersededFact }] =
        await Promise.all([
          clientA
            .from("continuity_facts")
            .select("status, source_inbox_item_id")
            .eq("id", stateReview.data![0].fact_id!)
            .single(),
          clientA
            .from("continuity_character_knowledge")
            .select("knowledge_state, certainty, source_inbox_item_id")
            .eq("id", knowledgeReview.data![0].knowledge_id!)
            .single(),
          clientA
            .from("continuity_timeline_events")
            .select("certainty, source_inbox_item_id")
            .eq("id", timelineReview.data![0].timeline_event_id!)
            .single(),
          clientA.from("continuity_facts").select("status").eq("id", oldFact!.id).single(),
        ]);
      expect(promotedFact).toMatchObject({
        status: "inference",
        source_inbox_item_id: itemByKind.get("state_change"),
      });
      expect(knowledge).toMatchObject({
        knowledge_state: "knows",
        certainty: "canon",
        source_inbox_item_id: itemByKind.get("knowledge_claim"),
      });
      expect(timeline).toMatchObject({
        certainty: "disputed",
        source_inbox_item_id: itemByKind.get("timeline_event"),
      });
      expect(supersededFact?.status).toBe("retconned");

      for (const table of [
        "continuity_analysis_runs",
        "continuity_inbox_items",
        "continuity_inbox_evidence",
        "continuity_timeline_events",
        "continuity_character_knowledge",
      ] as const) {
        const { data, error } = await clientB.from(table).select("id").eq("story_id", storyId);
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      }

      const { error: stolenRunError } = await clientB
        .from("continuity_analysis_runs")
        .insert({
          owner_id: ownerB,
          story_id: storyId,
          version_id: version!.id,
          detector_version: "stolen",
        });
      expect(stolenRunError).not.toBeNull();
    } finally {
      await clientA.from("stories").delete().eq("id", storyId);
    }
  });
});
