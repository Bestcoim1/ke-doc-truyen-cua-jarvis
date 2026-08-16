import { AlertTriangle, BookMarked, CheckCircle2, Compass, Plus } from "lucide-react";

import {
  CreateEntityForm,
  CreateFactForm,
  CreateThreadForm,
  FactStatusForm,
  ThreadStatusForm,
} from "@/components/studio/studio-forms";
import { ContinuityAutomation } from "@/components/studio/continuity-automation";
import { Button } from "@/components/ui/button";
import { buildContinuityBrief, type ContinuityBriefSelection } from "@/lib/studio/brief";
import {
  ENTITY_KIND_LABELS,
  EVIDENCE_KIND_LABELS,
  FACT_STATUS_LABELS,
  KNOWLEDGE_STATE_LABELS,
  THREAD_STATUS_LABELS,
  THREAD_TYPE_LABELS,
  type ContinuityEntityKind,
  type ContinuityEvidence,
  type ContinuityStudioData,
} from "@/lib/studio/types";

type ContinuityDashboardProps = {
  data: ContinuityStudioData;
  selection: ContinuityBriefSelection;
  briefRequested: boolean;
};

const ENTITY_ORDER: ContinuityEntityKind[] = [
  "character",
  "location",
  "item",
  "organization",
  "world_rule",
];

function evidenceLabel(
  evidence: ContinuityEvidence,
  chapterTitleById: Map<string, string>,
) {
  const label =
    (evidence.chapter_id ? chapterTitleById.get(evidence.chapter_id) : null) ??
    evidence.source_label ??
    "Nguồn chưa đặt tên";
  if (evidence.start_line === null) return label;
  const endLine = evidence.end_line ?? evidence.start_line;
  return `${label}:L${evidence.start_line}${endLine > evidence.start_line ? `–L${endLine}` : ""}`;
}

export function ContinuityDashboard({
  data,
  selection,
  briefRequested,
}: ContinuityDashboardProps) {
  const characters = data.entities.filter((entity) => entity.kind === "character");
  const locations = data.entities.filter((entity) => entity.kind === "location");
  const selectedCharacters = new Set(selection.characterEntityIds);
  const entityById = new Map(data.entities.map((entity) => [entity.id, entity]));
  const chapterTitleById = new Map(
    data.chapters.map((chapter) => [chapter.id, chapter.title]),
  );
  const evidenceByFact = new Map<string, ContinuityEvidence[]>();
  const evidenceByThread = new Map<string, ContinuityEvidence[]>();
  for (const evidence of data.evidence) {
    if (evidence.fact_id) {
      const list = evidenceByFact.get(evidence.fact_id) ?? [];
      list.push(evidence);
      evidenceByFact.set(evidence.fact_id, list);
    }
    if (evidence.plot_thread_id) {
      const list = evidenceByThread.get(evidence.plot_thread_id) ?? [];
      list.push(evidence);
      evidenceByThread.set(evidence.plot_thread_id, list);
    }
  }
  const brief = briefRequested ? buildContinuityBrief(data, selection) : null;

  return (
    <div className="space-y-8">
      <section id="brief" className="rounded-[2rem] border border-[var(--studio-border)] bg-[var(--studio-surface-raised)] p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--studio-accent)] text-white">
            <Compass size={21} />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--studio-muted)]">
              La bàn Continuity
            </p>
            <h2 className="mt-1 text-2xl font-extrabold">Nhắc trước khi viết</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--studio-muted)]">
              Chọn bối cảnh cảnh sắp viết. Brief chỉ dùng canon, suy luận và điểm tranh chấp đã có nguồn; fact ứng viên không được xem là canon.
            </p>
          </div>
        </div>

        <form method="get" className="mt-6 space-y-5">
          <input type="hidden" name="brief" value="1" />
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-bold">
              POV
              <select name="pov" defaultValue={selection.povEntityId ?? ""} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3">
                <option value="">Chưa chọn</option>
                {characters.map((entity) => (
                  <option key={entity.id} value={entity.id}>{entity.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              Địa điểm
              <select name="location" defaultValue={selection.locationEntityId ?? ""} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3">
                <option value="">Chưa chọn</option>
                {locations.map((entity) => (
                  <option key={entity.id} value={entity.id}>{entity.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              Mốc thời gian
              <input
                name="timeline"
                defaultValue={selection.timelineNote}
                maxLength={500}
                placeholder="Ví dụ: sáng hôm sau Chương 12"
                className="mt-2 min-h-11 w-full rounded-xl border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3"
              />
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-bold">Nhân vật hiện diện</legend>
            {characters.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--studio-muted)]">Thêm nhân vật vào Story Bible để chọn ở đây.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {characters.map((entity) => (
                  <label key={entity.id} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      name="characters"
                      value={entity.id}
                      defaultChecked={selectedCharacters.has(entity.id)}
                    />
                    {entity.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <Button type="submit" className="rounded-full">Tạo bản nhắc</Button>
        </form>

        {brief ? (
          <div className="mt-7 border-t border-[var(--studio-border)] pt-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-extrabold">Ngữ cảnh:</span>
              {brief.selectedEntityNames.length > 0 ? (
                brief.selectedEntityNames.map((name, index) => (
                  <span key={`${name}-${index}`} className="rounded-full bg-[var(--studio-bg)] px-3 py-1 font-semibold">{name}</span>
                ))
              ) : (
                <span className="text-[var(--studio-muted)]">chưa chọn thực thể cụ thể</span>
              )}
              {brief.timelineNote ? <span className="rounded-full bg-[var(--studio-bg)] px-3 py-1">{brief.timelineNote}</span> : null}
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="font-extrabold">Fact cần nhớ ({brief.facts.length})</h3>
                {brief.facts.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--studio-muted)]">Chưa có fact đã duyệt phù hợp với cảnh này.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {brief.facts.map((fact) => (
                      <li key={fact.id} className="rounded-2xl bg-[var(--studio-bg)] p-4">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--studio-muted)]">
                          <span>{fact.entityName}</span>
                          <span>·</span>
                          <span>{FACT_STATUS_LABELS[fact.status]}</span>
                        </div>
                        <p className="mt-2 text-sm leading-6">{fact.statement}</p>
                        <p className="mt-2 text-xs text-[var(--studio-muted)]">
                          Nguồn: {fact.sourcePointers.join("; ") || "chưa đọc được nguồn"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="font-extrabold">Plot thread đang mở ({brief.threads.length})</h3>
                {brief.threads.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--studio-muted)]">Không có plot thread đang mở.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {brief.threads.map((thread) => (
                      <li key={thread.id} className="rounded-2xl bg-[var(--studio-bg)] p-4">
                        <p className="text-sm font-extrabold">{thread.title}</p>
                        <p className="mt-1 text-xs font-bold text-[var(--studio-muted)]">
                          {THREAD_TYPE_LABELS[thread.thread_type]} · {THREAD_STATUS_LABELS[thread.status]}
                        </p>
                        {thread.expected_payoff ? <p className="mt-2 text-sm leading-6">Payoff: {thread.expected_payoff}</p> : null}
                        <p className="mt-2 text-xs text-[var(--studio-muted)]">
                          Nguồn: {thread.sourcePointers.join("; ") || "chưa đọc được nguồn"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="font-extrabold">Timeline liên quan ({brief.timelineEvents.length})</h3>
                {brief.timelineEvents.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--studio-muted)]">Chưa có sự kiện timeline đã duyệt cho bối cảnh này.</p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {brief.timelineEvents.map((event) => (
                      <li key={event.id} className="rounded-2xl bg-[var(--studio-bg)] p-4">
                        <p className="text-xs font-bold text-[var(--studio-muted)]">
                          {event.time_start || "Mốc chưa rõ"} · {FACT_STATUS_LABELS[event.certainty]}
                        </p>
                        <p className="mt-2 text-sm leading-6">{event.title}</p>
                        <p className="mt-2 text-xs text-[var(--studio-muted)]">
                          {[event.participantName, event.locationName].filter(Boolean).join(" · ") || "Toàn tác phẩm"}
                        </p>
                        <p className="mt-2 text-xs text-[var(--studio-muted)]">
                          Nguồn: {event.sourcePointers.join("; ") || "chưa đọc được nguồn"}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div>
                <h3 className="font-extrabold">Nhân vật biết gì ({brief.characterKnowledge.length})</h3>
                {brief.characterKnowledge.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--studio-muted)]">Chưa có knowledge record đã duyệt cho nhân vật được chọn.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {brief.characterKnowledge.map((record) => (
                      <li key={record.id} className="rounded-2xl bg-[var(--studio-bg)] p-4">
                        <p className="text-xs font-bold text-[var(--studio-muted)]">
                          {record.characterName} · {KNOWLEDGE_STATE_LABELS[record.knowledge_state]} · {FACT_STATUS_LABELS[record.certainty]}
                        </p>
                        <p className="mt-2 text-sm leading-6">{record.knowledge_text}</p>
                        <p className="mt-2 text-xs text-[var(--studio-muted)]">
                          Nguồn: {record.sourcePointers.join("; ") || "chưa đọc được nguồn"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded-2xl bg-[var(--studio-bg)] p-4 text-sm text-[var(--studio-muted)]">
            Bản nhắc được tạo theo yêu cầu và không được lưu thành canon mới.
          </p>
        )}
      </section>

      <ContinuityAutomation data={data} />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.6fr)]">
        <div className="space-y-8">
          <section id="bible" className="rounded-[2rem] border border-[var(--studio-border)] bg-[var(--studio-surface)] p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <BookMarked className="text-[var(--studio-accent)]" />
              <div>
                <h2 className="text-xl font-extrabold">Story Bible</h2>
                <p className="text-sm text-[var(--studio-muted)]">Thực thể có ID ổn định; bí danh không bị trộn với tên chính.</p>
              </div>
            </div>
            {data.entities.length === 0 ? (
              <p className="mt-5 rounded-2xl bg-[var(--studio-bg)] p-5 text-sm text-[var(--studio-muted)]">Chưa có nhân vật, địa điểm, vật phẩm hay luật thế giới.</p>
            ) : (
              <div className="mt-6 space-y-6">
                {ENTITY_ORDER.map((kind) => {
                  const entities = data.entities.filter((entity) => entity.kind === kind);
                  if (entities.length === 0) return null;
                  return (
                    <div key={kind}>
                      <h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--studio-muted)]">{ENTITY_KIND_LABELS[kind]}</h3>
                      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                        {entities.map((entity) => (
                          <li key={entity.id} className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-raised)] p-4">
                            <p className="font-extrabold">{entity.name}</p>
                            {entity.aliases.length > 0 ? <p className="mt-1 text-xs text-[var(--studio-muted)]">Còn gọi: {entity.aliases.join(", ")}</p> : null}
                            {entity.description ? <p className="mt-3 text-sm leading-6 text-[var(--studio-muted)]">{entity.description}</p> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section id="facts" className="rounded-[2rem] border border-[var(--studio-border)] bg-[var(--studio-surface)] p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-[var(--studio-accent)]" />
              <div>
                <h2 className="text-xl font-extrabold">Fact và nguồn</h2>
                <p className="text-sm text-[var(--studio-muted)]">Canon, ứng viên, suy luận và retcon luôn được giữ riêng.</p>
              </div>
            </div>
            {data.facts.length === 0 ? (
              <p className="mt-5 rounded-2xl bg-[var(--studio-bg)] p-5 text-sm text-[var(--studio-muted)]">Chưa có fact continuity nào.</p>
            ) : (
              <ul className="mt-5 space-y-4">
                {data.facts.map((fact) => {
                  const evidence = evidenceByFact.get(fact.id) ?? [];
                  return (
                    <li key={fact.id} className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-raised)] p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--studio-muted)]">
                        <span>{fact.entity_id ? (entityById.get(fact.entity_id)?.name ?? "Thực thể đã lưu trữ") : "Toàn tác phẩm"}</span>
                        <span>·</span>
                        <span>{FACT_STATUS_LABELS[fact.status]}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6">{fact.statement}</p>
                      <ul className="mt-3 space-y-1 text-xs text-[var(--studio-muted)]">
                        {evidence.map((item) => (
                          <li key={item.id}>
                            {EVIDENCE_KIND_LABELS[item.source_kind]} · {evidenceLabel(item, chapterTitleById)}
                          </li>
                        ))}
                      </ul>
                      <FactStatusForm storyId={data.story.id} factId={fact.id} currentStatus={fact.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section id="threads" className="rounded-[2rem] border border-[var(--studio-border)] bg-[var(--studio-surface)] p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-[var(--studio-accent)]" />
              <div>
                <h2 className="text-xl font-extrabold">Plot Thread Tracker</h2>
                <p className="text-sm text-[var(--studio-muted)]">Theo dõi setup, lời hứa và payoff mà không kết luận sớm là plot hole.</p>
              </div>
            </div>
            {data.threads.length === 0 ? (
              <p className="mt-5 rounded-2xl bg-[var(--studio-bg)] p-5 text-sm text-[var(--studio-muted)]">Chưa có plot thread nào.</p>
            ) : (
              <ul className="mt-5 space-y-4">
                {data.threads.map((thread) => {
                  const evidence = evidenceByThread.get(thread.id) ?? [];
                  return (
                    <li key={thread.id} className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-raised)] p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--studio-muted)]">
                        <span>{THREAD_TYPE_LABELS[thread.thread_type]}</span>
                        <span>·</span>
                        <span>{THREAD_STATUS_LABELS[thread.status]}</span>
                      </div>
                      <h3 className="mt-2 font-extrabold">{thread.title}</h3>
                      {thread.setup ? <p className="mt-3 text-sm leading-6"><strong>Setup:</strong> {thread.setup}</p> : null}
                      {thread.promise ? <p className="mt-2 text-sm leading-6"><strong>Lời hứa:</strong> {thread.promise}</p> : null}
                      {thread.expected_payoff ? <p className="mt-2 text-sm leading-6"><strong>Payoff:</strong> {thread.expected_payoff}</p> : null}
                      <ul className="mt-3 space-y-1 text-xs text-[var(--studio-muted)]">
                        {evidence.map((item) => (
                          <li key={item.id}>{EVIDENCE_KIND_LABELS[item.source_kind]} · {evidenceLabel(item, chapterTitleById)}</li>
                        ))}
                      </ul>
                      <ThreadStatusForm storyId={data.story.id} threadId={thread.id} currentStatus={thread.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <details open className="rounded-3xl border border-[var(--studio-border)] bg-[var(--studio-surface)] p-5">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-extrabold"><Plus size={17} /> Thêm Story Bible</summary>
            <div className="mt-5"><CreateEntityForm storyId={data.story.id} /></div>
          </details>
          <details className="rounded-3xl border border-[var(--studio-border)] bg-[var(--studio-surface)] p-5">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-extrabold"><Plus size={17} /> Thêm fact có nguồn</summary>
            <div className="mt-5"><CreateFactForm storyId={data.story.id} entities={data.entities} chapters={data.chapters} /></div>
          </details>
          <details className="rounded-3xl border border-[var(--studio-border)] bg-[var(--studio-surface)] p-5">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-extrabold"><Plus size={17} /> Thêm plot thread</summary>
            <div className="mt-5"><CreateThreadForm storyId={data.story.id} chapters={data.chapters} /></div>
          </details>
        </aside>
      </div>
    </div>
  );
}
