import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/database.types";
import { parseChapterContent } from "@/lib/reader/content";
import { buildFlatChapterList } from "@/lib/reader/tree";
import { fetchAllPages } from "@/lib/supabase/pagination";
import {
  CONTINUITY_DETECTOR_VERSION,
  detectContinuityAlerts,
  extractContinuityCandidates,
  type AcceptedAnalysisItem,
  type AnalysisEvidenceSeed,
  type AnalysisFact,
  type AnalysisItemSeed,
  type AnalysisKnowledge,
  type AnalysisThread,
} from "@/lib/studio/automation";
import type { ContinuityEntity } from "@/lib/studio/types";
import { logEvent } from "@/lib/telemetry";

type StudioClient = SupabaseClient<Database>;

export type ContinuityAnalysisOutcome = {
  status: "completed" | "skipped" | "unavailable" | "failed";
  candidates: number;
  alerts: number;
};

const EMPTY_OUTCOME: ContinuityAnalysisOutcome = {
  status: "skipped",
  candidates: 0,
  alerts: 0,
};
const STALE_RUN_AFTER_MS = 15 * 60 * 1000;

function jsonObject(value: Json): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Json>;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function detectorVersionForContext(groups: unknown[][]) {
  const normalized = groups.map((rows) => rows.map(stableJson).sort());
  const digest = createHash("sha256")
    .update(stableJson(normalized))
    .digest("hex")
    .slice(0, 16);
  return `${CONTINUITY_DETECTOR_VERSION}:${digest}`;
}

function asEvidence(row: {
  chapter_id: string | null;
  chapter_revision_id?: string | null;
  source_label: string | null;
  source_anchor_id?: string | null;
  start_line: number | null;
  end_line: number | null;
  excerpt: string | null;
}): AnalysisEvidenceSeed {
  return {
    chapterId: row.chapter_id,
    chapterRevisionId: row.chapter_revision_id ?? null,
    sourceLabel: row.source_label ?? "Nguồn chưa đặt tên",
    sourceAnchorId: row.source_anchor_id ?? null,
    startLine: row.start_line,
    endLine: row.end_line,
    excerpt: row.excerpt,
  };
}

function groupEvidence<T extends { inbox_item_id: string }>(rows: T[]) {
  const result = new Map<string, AnalysisEvidenceSeed[]>();
  for (const row of rows) {
    const list = result.get(row.inbox_item_id) ?? [];
    list.push(asEvidence(row as T & Parameters<typeof asEvidence>[0]));
    result.set(row.inbox_item_id, list);
  }
  return result;
}

function groupP0Evidence<
  T extends { fact_id: string | null; plot_thread_id: string | null },
>(rows: T[]) {
  const facts = new Map<string, AnalysisEvidenceSeed[]>();
  const threads = new Map<string, AnalysisEvidenceSeed[]>();
  for (const row of rows) {
    const evidence = asEvidence(row as T & Parameters<typeof asEvidence>[0]);
    if (row.fact_id) {
      const list = facts.get(row.fact_id) ?? [];
      list.push(evidence);
      facts.set(row.fact_id, list);
    }
    if (row.plot_thread_id) {
      const list = threads.get(row.plot_thread_id) ?? [];
      list.push(evidence);
      threads.set(row.plot_thread_id, list);
    }
  }
  return { facts, threads };
}

async function beginRun(
  supabase: StudioClient,
  ownerId: string,
  storyId: string,
  versionId: string,
  importJobId: string | null,
  detectorVersion: string,
) {
  const { data: inserted, error } = await supabase
    .from("continuity_analysis_runs")
    .insert({
      owner_id: ownerId,
      story_id: storyId,
      version_id: versionId,
      import_job_id: importJobId,
      status: "running",
      detector_version: detectorVersion,
    })
    .select("id, status")
    .maybeSingle();

  if (inserted) return { id: inserted.id, shouldRun: true as const };
  if (error?.code !== "23505") {
    const unavailable =
      error?.code === "42P01" ||
      error?.code === "PGRST204" ||
      error?.code === "PGRST205";
    return { id: null, shouldRun: false as const, unavailable, errorCode: error?.code };
  }

  const { data: existing, error: existingError } = await supabase
    .from("continuity_analysis_runs")
    .select("id, status, started_at")
    .eq("story_id", storyId)
    .eq("version_id", versionId)
    .eq("owner_id", ownerId)
    .eq("detector_version", detectorVersion)
    .maybeSingle();
  if (existingError || !existing) {
    return { id: null, shouldRun: false as const, unavailable: false, errorCode: existingError?.code };
  }
  const startedAt = Date.parse(existing.started_at);
  const isStaleRun =
    existing.status === "running" &&
    Number.isFinite(startedAt) &&
    Date.now() - startedAt >= STALE_RUN_AFTER_MS;
  if (existing.status !== "failed" && !isStaleRun) {
    return { id: existing.id, shouldRun: false as const, unavailable: false };
  }

  const { error: cleanupError } = await supabase
    .from("continuity_inbox_items")
    .delete()
    .eq("run_id", existing.id)
    .eq("owner_id", ownerId);
  if (cleanupError) {
    return { id: null, shouldRun: false as const, unavailable: false, errorCode: cleanupError.code };
  }
  const { data: restarted, error: restartError } = await supabase
    .from("continuity_analysis_runs")
    .update({
      status: "running",
      detector_version: detectorVersion,
      chapters_analyzed: 0,
      candidate_count: 0,
      alert_count: 0,
      error_message: null,
      completed_at: null,
      started_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .eq("owner_id", ownerId)
    .eq("status", existing.status)
    .eq("started_at", existing.started_at)
    .select("id")
    .maybeSingle();
  return restarted
    ? { id: restarted.id, shouldRun: true as const }
    : { id: null, shouldRun: false as const, unavailable: false, errorCode: restartError?.code };
}

async function insertAnalysisItems(
  supabase: StudioClient,
  ownerId: string,
  storyId: string,
  runId: string,
  seeds: AnalysisItemSeed[],
) {
  const seedByFingerprint = new Map(seeds.map((seed) => [seed.fingerprint, seed]));
  const insertedRows: Array<{ id: string; fingerprint: string }> = [];
  for (let index = 0; index < seeds.length; index += 200) {
    const batch = seeds.slice(index, index + 200).map((seed) => ({
      owner_id: ownerId,
      story_id: storyId,
      run_id: runId,
      kind: seed.kind,
      alert_kind: seed.alertKind,
      severity: seed.severity,
      subject_entity_id: seed.subjectEntityId,
      related_entity_id: seed.relatedEntityId,
      statement: seed.statement,
      metadata: seed.metadata as Json,
      fingerprint: seed.fingerprint,
    }));
    const { data, error } = await supabase
      .from("continuity_inbox_items")
      .insert(batch)
      .select("id, fingerprint");
    if (error) throw new Error(`continuity_item_insert:${error.code}`);
    insertedRows.push(...(data ?? []));
  }

  const evidenceRows = insertedRows.flatMap((row) => {
    const seed = seedByFingerprint.get(row.fingerprint);
    if (!seed) return [];
    return seed.evidence.map((evidence) => ({
      owner_id: ownerId,
      story_id: storyId,
      inbox_item_id: row.id,
      chapter_id: evidence.chapterId,
      chapter_revision_id: evidence.chapterRevisionId,
      source_label: evidence.sourceLabel,
      source_anchor_id: evidence.sourceAnchorId,
      start_line: evidence.startLine,
      end_line: evidence.endLine,
      excerpt: evidence.excerpt,
    }));
  });
  for (let index = 0; index < evidenceRows.length; index += 300) {
    const { error } = await supabase
      .from("continuity_inbox_evidence")
      .insert(evidenceRows.slice(index, index + 300));
    if (error) throw new Error(`continuity_evidence_insert:${error.code}`);
  }
}

export async function analyzeCommittedVersion(
  supabase: StudioClient,
  ownerId: string,
  storyId: string,
  versionId: string,
  importJobId: string | null,
): Promise<ContinuityAnalysisOutcome> {
  const [entities, facts, existingItems, knowledge, threads] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_entities")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .is("archived_at", null)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_facts")
        .select("id, entity_id, statement, status, updated_at")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .in("status", ["canon", "inference", "disputed"])
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_inbox_items")
        .select("id, kind, subject_entity_id, related_entity_id, statement, metadata, review_status, fingerprint, updated_at")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_character_knowledge")
        .select("id, character_entity_id, knowledge_text, knowledge_state, chapter_sequence, source_inbox_item_id, updated_at")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("continuity_plot_threads")
        .select("id, title, last_touched_chapter_id, due_chapter_id, status, updated_at")
        .eq("owner_id", ownerId)
        .eq("story_id", storyId)
        .in("status", ["open", "progressing", "apparently_dropped"])
        .order("id")
        .range(from, to),
    ),
  ]);
  const contextError =
    entities.error ?? facts.error ?? existingItems.error ?? knowledge.error ?? threads.error;
  if (contextError) {
    const unavailable =
      contextError.code === "42P01" ||
      contextError.code === "PGRST204" ||
      contextError.code === "PGRST205";
    logEvent("studio.analysis_context_failed", {
      storyId,
      versionId,
      code: contextError.code,
    });
    return { ...EMPTY_OUTCOME, status: unavailable ? "unavailable" : "failed" };
  }

  const detectorVersion = detectorVersionForContext([
    entities.data ?? [],
    facts.data ?? [],
    (existingItems.data ?? []).filter((item) => item.review_status !== "pending"),
    knowledge.data ?? [],
    threads.data ?? [],
  ]);
  const run = await beginRun(
    supabase,
    ownerId,
    storyId,
    versionId,
    importJobId,
    detectorVersion,
  );
  if (!run.shouldRun) {
    if (run.unavailable) return { ...EMPTY_OUTCOME, status: "unavailable" };
    if (run.errorCode) {
      logEvent("studio.analysis_start_failed", {
        storyId,
        versionId,
        code: run.errorCode,
      });
      return { ...EMPTY_OUTCOME, status: "failed" };
    }
    return EMPTY_OUTCOME;
  }

  try {
    const [sections, chapters, revisions, p0Evidence] = await Promise.all([
      fetchAllPages((from, to) =>
        supabase
          .from("sections")
          .select("id, parent_section_id, title, sort_order")
          .eq("story_id", storyId)
          .eq("is_active", true)
          .range(from, to),
      ),
      fetchAllPages((from, to) =>
        supabase
          .from("chapters")
          .select("id, section_id, title, sort_order, current_revision_id")
          .eq("story_id", storyId)
          .eq("is_active", true)
          .range(from, to),
      ),
      fetchAllPages((from, to) =>
        supabase
          .from("chapter_revisions")
          .select("id, chapter_id, content_blocks")
          .eq("created_in_version_id", versionId)
          .range(from, to),
      ),
      fetchAllPages((from, to) =>
        supabase
          .from("continuity_evidence")
          .select("fact_id, plot_thread_id, chapter_id, chapter_revision_id, source_label, source_anchor_id, start_line, end_line, excerpt")
          .eq("owner_id", ownerId)
          .eq("story_id", storyId)
          .range(from, to),
      ),
    ]);

    const firstError = sections.error ?? chapters.error ?? revisions.error ?? p0Evidence.error;
    if (firstError) throw new Error(`continuity_source_query:${firstError.code}`);

    const acceptedIds = [...new Set([
      ...(existingItems.data ?? [])
        .filter((item) => item.review_status === "accepted")
        .map((item) => item.id),
      ...(knowledge.data ?? []).map((item) => item.source_inbox_item_id),
    ])];
    const inboxEvidenceRows: Array<
      Pick<
        Database["public"]["Tables"]["continuity_inbox_evidence"]["Row"],
        | "inbox_item_id"
        | "chapter_id"
        | "chapter_revision_id"
        | "source_label"
        | "source_anchor_id"
        | "start_line"
        | "end_line"
        | "excerpt"
      >
    > = [];
    for (let index = 0; index < acceptedIds.length; index += 100) {
      const itemIds = acceptedIds.slice(index, index + 100);
      const page = await fetchAllPages((from, to) =>
          supabase
            .from("continuity_inbox_evidence")
            .select("inbox_item_id, chapter_id, chapter_revision_id, source_label, source_anchor_id, start_line, end_line, excerpt")
            .eq("owner_id", ownerId)
            .eq("story_id", storyId)
            .in("inbox_item_id", itemIds)
            .range(from, to),
      );
      if (page.error) {
        throw new Error(`continuity_inbox_evidence_query:${page.error.code}`);
      }
      inboxEvidenceRows.push(...(page.data ?? []));
    }

    const flatChapters = buildFlatChapterList(sections.data ?? [], chapters.data ?? []);
    const chapterSequenceById = new Map(
      flatChapters.map((chapter) => [chapter.chapterId, chapter.sortKey]),
    );
    const chapterById = new Map((chapters.data ?? []).map((chapter) => [chapter.id, chapter]));
    const analysisChapters = (revisions.data ?? []).flatMap((revision) => {
      const chapter = chapterById.get(revision.chapter_id);
      const sequence = chapterSequenceById.get(revision.chapter_id);
      const content = parseChapterContent(revision.content_blocks);
      if (!chapter || sequence === undefined || !content) return [];
      return [{
        id: chapter.id,
        revisionId: revision.id,
        title: chapter.title,
        sequence,
        blocks: content.blocks,
      }];
    });

    const existingFingerprints = new Set(
      (existingItems.data ?? []).map((item) => item.fingerprint),
    );
    const candidates = extractContinuityCandidates(
      analysisChapters,
      (entities.data ?? []) as ContinuityEntity[],
    ).filter((candidate) => !existingFingerprints.has(candidate.fingerprint));
    const inboxEvidenceByItem = groupEvidence(inboxEvidenceRows);
    const p0EvidenceByParent = groupP0Evidence(p0Evidence.data ?? []);
    const accepted: AcceptedAnalysisItem[] = (existingItems.data ?? [])
      .filter((item) => item.review_status === "accepted")
      .map((item) => ({
        kind: item.kind,
        subjectEntityId: item.subject_entity_id,
        relatedEntityId: item.related_entity_id,
        statement: item.statement,
        metadata: jsonObject(item.metadata),
        evidence: inboxEvidenceByItem.get(item.id) ?? [],
      }));
    const analysisFacts: AnalysisFact[] = (facts.data ?? []).map((fact) => ({
      id: fact.id,
      entityId: fact.entity_id,
      statement: fact.statement,
      evidence: p0EvidenceByParent.facts.get(fact.id) ?? [],
    }));
    const analysisKnowledge: AnalysisKnowledge[] = (knowledge.data ?? []).map((item) => ({
      characterEntityId: item.character_entity_id,
      knowledgeText: item.knowledge_text,
      knowledgeState: item.knowledge_state,
      chapterSequence: item.chapter_sequence,
      evidence: inboxEvidenceByItem.get(item.source_inbox_item_id) ?? [],
    }));
    const analysisThreads: AnalysisThread[] = (threads.data ?? []).map((thread) => ({
      id: thread.id,
      title: thread.title,
      lastTouchedChapterId: thread.last_touched_chapter_id,
      dueChapterId: thread.due_chapter_id,
      evidence: p0EvidenceByParent.threads.get(thread.id) ?? [],
    }));
    const alerts = detectContinuityAlerts({
      candidates,
      entities: (entities.data ?? []) as ContinuityEntity[],
      facts: analysisFacts,
      acceptedItems: accepted,
      knowledge: analysisKnowledge,
      threads: analysisThreads,
      chapterSequenceById,
      latestChapterSequence: Math.max(0, flatChapters.length - 1),
    }).filter((alert) => !existingFingerprints.has(alert.fingerprint));

    await insertAnalysisItems(
      supabase,
      ownerId,
      storyId,
      run.id,
      [...candidates, ...alerts],
    );

    const { error: completeError } = await supabase
      .from("continuity_analysis_runs")
      .update({
        status: "completed",
        chapters_analyzed: analysisChapters.length,
        candidate_count: candidates.length,
        alert_count: alerts.length,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("owner_id", ownerId);
    if (completeError) throw new Error(`continuity_run_complete:${completeError.code}`);

    logEvent("studio.analysis_completed", {
      storyId,
      versionId,
      chapters: analysisChapters.length,
      candidates: candidates.length,
      alerts: alerts.length,
    });
    return { status: "completed", candidates: candidates.length, alerts: alerts.length };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "continuity_analysis_failed";
    await supabase
      .from("continuity_analysis_runs")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("owner_id", ownerId);
    logEvent("studio.analysis_failed", { storyId, versionId, code: message.split(":")[0] });
    return { ...EMPTY_OUTCOME, status: "failed" };
  }
}

export async function tryAnalyzeCommittedVersion(
  supabase: StudioClient,
  ownerId: string,
  storyId: string,
  versionId: string,
  importJobId: string | null,
) {
  try {
    return await analyzeCommittedVersion(
      supabase,
      ownerId,
      storyId,
      versionId,
      importJobId,
    );
  } catch (error) {
    logEvent("studio.analysis_start_failed", {
      storyId,
      versionId,
      code: error instanceof Error ? error.message.split(":")[0] : "unknown",
    });
    return { ...EMPTY_OUTCOME, status: "failed" as const };
  }
}
