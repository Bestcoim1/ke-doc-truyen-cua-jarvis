import { AlertCircle, Brain, History, Inbox, ScanSearch } from "lucide-react";

import {
  InboxReviewForm,
  RunContinuityAnalysisForm,
} from "@/components/studio/automation-forms";
import type { Json } from "@/database.types";
import {
  ALERT_KIND_LABELS,
  FACT_STATUS_LABELS,
  INBOX_KIND_LABELS,
  KNOWLEDGE_STATE_LABELS,
  SEVERITY_LABELS,
  type ContinuityInboxEvidence,
  type ContinuityKnowledgeState,
  type ContinuityStudioData,
} from "@/lib/studio/types";

function metadataString(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function evidencePointer(evidence: ContinuityInboxEvidence) {
  const line = evidence.start_line === null
    ? ""
    : ` · L${evidence.start_line}${
        evidence.end_line !== null && evidence.end_line > evidence.start_line
          ? `–L${evidence.end_line}`
          : ""
      }`;
  const chapter = evidence.chapter_id ? ` · chapter ${evidence.chapter_id}` : "";
  const revision = evidence.chapter_revision_id
    ? ` · revision ${evidence.chapter_revision_id}`
    : "";
  return `${evidence.source_label}${chapter}${revision}${line}`;
}

export function ContinuityAutomation({ data }: { data: ContinuityStudioData }) {
  const entityById = new Map(data.entities.map((entity) => [entity.id, entity]));
  const reviewedEvidenceByItem = new Map<string, ContinuityInboxEvidence[]>();
  for (const evidence of data.reviewedEvidence) {
    const list = reviewedEvidenceByItem.get(evidence.inbox_item_id) ?? [];
    list.push(evidence);
    reviewedEvidenceByItem.set(evidence.inbox_item_id, list);
  }
  const latestRun = data.analysisRuns[0] ?? null;
  const alerts = data.inboxItems.filter((item) => item.kind === "alert");
  const candidates = data.inboxItems.filter((item) => item.kind !== "alert");

  if (!data.p1Available) {
    return (
      <section className="rounded-[2rem] border border-amber-400/50 bg-amber-50 p-6 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <h2 className="font-extrabold">Continuity P1 chưa được bật trong database</h2>
        <p className="mt-2 text-sm leading-6">
          P0 vẫn hoạt động bình thường. Áp dụng migration P1 để mở trích xuất ứng viên, timeline, character knowledge và Inbox cảnh báo.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section id="inbox" className="rounded-[2rem] border border-[var(--studio-border)] bg-[var(--studio-surface)] p-5 sm:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--studio-accent)] text-white">
              <Inbox size={20} />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--studio-muted)]">Tác giả quyết định</p>
              <h2 className="mt-1 text-2xl font-extrabold">Continuity Inbox ({data.inboxItems.length})</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--studio-muted)]">
                Bộ quét theo quy tắc chỉ tạo ứng viên và rủi ro có dẫn chứng. Không mục nào trở thành canon nếu bạn chưa chấp nhận rõ ràng.
              </p>
            </div>
          </div>
          <RunContinuityAnalysisForm storyId={data.story.id} />
        </div>

        {latestRun ? (
          <p className="mt-5 rounded-2xl bg-[var(--studio-bg)] px-4 py-3 text-xs text-[var(--studio-muted)]">
            Lần quét gần nhất: {latestRun.status} · {latestRun.chapters_analyzed} revision · {latestRun.candidate_count} ứng viên · {latestRun.alert_count} cảnh báo
          </p>
        ) : null}

        {data.inboxItems.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-[var(--studio-bg)] p-6 text-center">
            <ScanSearch className="mx-auto text-[var(--studio-muted)]" />
            <p className="mt-3 text-sm text-[var(--studio-muted)]">Inbox đang trống. Import/reimport tiếp theo sẽ tự quét revision mới.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <InboxGroup title={`Cảnh báo cần duyệt (${alerts.length})`} items={alerts} data={data} entityById={entityById} />
            <InboxGroup title={`Fact ứng viên (${candidates.length})`} items={candidates} data={data} entityById={entityById} />
          </div>
        )}
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        <section id="timeline" className="rounded-[2rem] border border-[var(--studio-border)] bg-[var(--studio-surface)] p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <History className="text-[var(--studio-accent)]" />
            <div>
              <h2 className="text-xl font-extrabold">Timeline đã duyệt</h2>
              <p className="text-sm text-[var(--studio-muted)]">Chỉ gồm sự kiện tác giả đã chấp nhận.</p>
            </div>
          </div>
          {data.timelineEvents.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-[var(--studio-bg)] p-5 text-sm text-[var(--studio-muted)]">Chưa có sự kiện timeline đã duyệt.</p>
          ) : (
            <ol className="mt-5 space-y-3">
              {data.timelineEvents.map((event) => (
                <li key={event.id} className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-raised)] p-4 [content-visibility:auto]">
                  <p className="text-xs font-bold text-[var(--studio-muted)]">
                    {event.time_start || "Mốc chưa rõ"} · {FACT_STATUS_LABELS[event.certainty]}
                  </p>
                  <p className="mt-2 text-sm leading-6">{event.title}</p>
                  <p className="mt-2 text-xs text-[var(--studio-muted)]">
                    {[event.participant_entity_id ? entityById.get(event.participant_entity_id)?.name : null, event.location_entity_id ? entityById.get(event.location_entity_id)?.name : null].filter(Boolean).join(" · ") || "Chưa gắn thực thể"}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-[var(--studio-muted)]">
                    {(reviewedEvidenceByItem.get(event.source_inbox_item_id) ?? []).map((evidence) => (
                      <li key={evidence.id}>{evidencePointer(evidence)}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section id="knowledge" className="rounded-[2rem] border border-[var(--studio-border)] bg-[var(--studio-surface)] p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <Brain className="text-[var(--studio-accent)]" />
            <div>
              <h2 className="text-xl font-extrabold">Character Knowledge</h2>
              <p className="text-sm text-[var(--studio-muted)]">Ai biết gì, từ mốc nào và ở mức chắc chắn nào.</p>
            </div>
          </div>
          {data.characterKnowledge.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-[var(--studio-bg)] p-5 text-sm text-[var(--studio-muted)]">Chưa có knowledge record đã duyệt.</p>
          ) : (
            <ul className="mt-5 space-y-3">
              {data.characterKnowledge.map((record) => (
                <li key={record.id} className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-raised)] p-4 [content-visibility:auto]">
                  <p className="text-xs font-bold text-[var(--studio-muted)]">
                    {entityById.get(record.character_entity_id)?.name ?? "Nhân vật đã lưu trữ"} · {KNOWLEDGE_STATE_LABELS[record.knowledge_state]} · {FACT_STATUS_LABELS[record.certainty]}
                  </p>
                  <p className="mt-2 text-sm leading-6">{record.knowledge_text}</p>
                  <ul className="mt-2 space-y-1 text-xs text-[var(--studio-muted)]">
                    {(reviewedEvidenceByItem.get(record.source_inbox_item_id) ?? []).map((evidence) => (
                      <li key={evidence.id}>{evidencePointer(evidence)}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function InboxGroup({
  title,
  items,
  data,
  entityById,
}: {
  title: string;
  items: ContinuityStudioData["inboxItems"];
  data: ContinuityStudioData;
  entityById: Map<string, ContinuityStudioData["entities"][number]>;
}) {
  return (
    <div>
      <h3 className="font-extrabold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-[var(--studio-bg)] p-4 text-sm text-[var(--studio-muted)]">Không có mục nào.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {items.map((item) => {
            const suggestedState = metadataString(item.metadata, "suggestedKnowledgeState");
            const knowledgeState = suggestedState && suggestedState in KNOWLEDGE_STATE_LABELS
              ? (suggestedState as ContinuityKnowledgeState)
              : undefined;
            return (
              <li key={item.id} className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-raised)] p-4 [content-visibility:auto]">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--studio-muted)]">
                  {item.kind === "alert" ? <AlertCircle size={14} className="text-amber-600" /> : null}
                  <span>{item.kind === "alert" && item.alert_kind ? ALERT_KIND_LABELS[item.alert_kind] : INBOX_KIND_LABELS[item.kind]}</span>
                  {item.severity ? <span>· {SEVERITY_LABELS[item.severity]}</span> : null}
                  {item.subject_entity_id ? <span>· {entityById.get(item.subject_entity_id)?.name ?? "Thực thể đã lưu trữ"}</span> : null}
                </div>
                <p className="mt-2 text-sm leading-6">{item.statement}</p>
                <ul className="mt-3 space-y-1 text-xs text-[var(--studio-muted)]">
                  {item.evidence.length > 0 ? item.evidence.map((evidence) => (
                    <li key={evidence.id} className="break-all">Nguồn: {evidencePointer(evidence)}</li>
                  )) : <li>Chưa có source pointer đọc được; không nên xác nhận là lỗi canon.</li>}
                </ul>
                <InboxReviewForm
                  storyId={data.story.id}
                itemId={item.id}
                kind={item.kind}
                alertKind={item.alert_kind}
                suggestedKnowledgeState={knowledgeState}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
