"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  createContinuityEntity,
  createContinuityFact,
  createContinuityPlotThread,
  updateContinuityFactStatus,
  updateContinuityThreadStatus,
} from "@/lib/studio/actions";
import {
  CONTINUITY_ENTITY_KINDS,
  CONTINUITY_EVIDENCE_KINDS,
  CONTINUITY_FACT_STATUSES,
  CONTINUITY_THREAD_STATUSES,
  CONTINUITY_THREAD_TYPES,
  EMPTY_STUDIO_ACTION_STATE,
  ENTITY_KIND_LABELS,
  EVIDENCE_KIND_LABELS,
  FACT_STATUS_LABELS,
  THREAD_STATUS_LABELS,
  THREAD_TYPE_LABELS,
  type ContinuityEntity,
  type ContinuityFactStatus,
  type ContinuityThreadStatus,
  type StudioActionState,
  type StudioChapter,
} from "@/lib/studio/types";

const FIELD_CLASS =
  "mt-2 min-h-11 w-full rounded-xl border border-[var(--studio-border)] bg-[var(--studio-bg)] px-3 text-sm text-[var(--studio-text)]";
const TEXTAREA_CLASS = `${FIELD_CLASS} min-h-24 py-3`;

function ActionMessage({ state }: { state: StudioActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-700 dark:text-emerald-400"}
    >
      {state.message}
    </p>
  );
}

function EvidenceFields({ chapters }: { chapters: StudioChapter[] }) {
  return (
    <fieldset className="space-y-4 rounded-2xl border border-[var(--studio-border)] p-4">
      <legend className="px-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--studio-muted)]">
        Dẫn chứng bắt buộc
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Loại nguồn
          <select name="sourceKind" defaultValue="direct_source" className={FIELD_CLASS}>
            {CONTINUITY_EVIDENCE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {EVIDENCE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Chương nguồn
          <select name="chapterId" defaultValue="" className={FIELD_CLASS}>
            <option value="">Nguồn ngoài bản thảo</option>
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-bold">
        Tên tài liệu hoặc nhãn nguồn
        <input
          name="sourceLabel"
          maxLength={500}
          placeholder="Ví dụ: Story Bible chính thức — nếu không chọn chương"
          className={FIELD_CLASS}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Dòng bắt đầu
          <input name="startLine" type="number" min={1} className={FIELD_CLASS} />
        </label>
        <label className="text-sm font-bold">
          Dòng kết thúc
          <input name="endLine" type="number" min={1} className={FIELD_CLASS} />
        </label>
      </div>
      <label className="block text-sm font-bold">
        Trích đoạn ngắn
        <textarea name="excerpt" maxLength={4000} className={TEXTAREA_CLASS} />
      </label>
    </fieldset>
  );
}

export function CreateEntityForm({ storyId }: { storyId: string }) {
  const [state, formAction, isPending] = useActionState(
    createContinuityEntity,
    EMPTY_STUDIO_ACTION_STATE,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="storyId" value={storyId} />
      <label className="block text-sm font-bold">
        Loại mục
        <select name="kind" defaultValue="character" className={FIELD_CLASS}>
          {CONTINUITY_ENTITY_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {ENTITY_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-bold">
        Tên
        <input required name="name" maxLength={160} className={FIELD_CLASS} />
      </label>
      <label className="block text-sm font-bold">
        Bí danh
        <input
          name="aliases"
          placeholder="Ngăn cách bằng dấu phẩy hoặc xuống dòng"
          className={FIELD_CLASS}
        />
      </label>
      <label className="block text-sm font-bold">
        Mô tả
        <textarea name="description" maxLength={4000} className={TEXTAREA_CLASS} />
      </label>
      <ActionMessage state={state} />
      <Button type="submit" disabled={isPending} className="rounded-full">
        {isPending ? "Đang lưu…" : "Thêm vào Story Bible"}
      </Button>
    </form>
  );
}

export function CreateFactForm({
  storyId,
  entities,
  chapters,
}: {
  storyId: string;
  entities: ContinuityEntity[];
  chapters: StudioChapter[];
}) {
  const [state, formAction, isPending] = useActionState(
    createContinuityFact,
    EMPTY_STUDIO_ACTION_STATE,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="storyId" value={storyId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Gắn với
          <select name="entityId" defaultValue="" className={FIELD_CLASS}>
            <option value="">Toàn tác phẩm</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {ENTITY_KIND_LABELS[entity.kind]} · {entity.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Trạng thái
          <select name="status" defaultValue="candidate" className={FIELD_CLASS}>
            {CONTINUITY_FACT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {FACT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-bold">
        Fact cần nhớ
        <textarea required name="statement" maxLength={4000} className={TEXTAREA_CLASS} />
      </label>
      <EvidenceFields chapters={chapters} />
      <ActionMessage state={state} />
      <Button type="submit" disabled={isPending} className="rounded-full">
        {isPending ? "Đang lưu…" : "Lưu fact có dẫn chứng"}
      </Button>
    </form>
  );
}

export function CreateThreadForm({
  storyId,
  chapters,
}: {
  storyId: string;
  chapters: StudioChapter[];
}) {
  const [state, formAction, isPending] = useActionState(
    createContinuityPlotThread,
    EMPTY_STUDIO_ACTION_STATE,
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="storyId" value={storyId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Loại thread
          <select name="threadType" defaultValue="foreshadowing" className={FIELD_CLASS}>
            {CONTINUITY_THREAD_TYPES.map((type) => (
              <option key={type} value={type}>
                {THREAD_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Chương dự kiến payoff
          <select name="dueChapterId" defaultValue="" className={FIELD_CLASS}>
            <option value="">Chưa xác định</option>
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-bold">
        Tên thread
        <input required name="title" maxLength={240} className={FIELD_CLASS} />
      </label>
      <label className="block text-sm font-bold">
        Setup
        <textarea name="setup" maxLength={4000} className={TEXTAREA_CLASS} />
      </label>
      <label className="block text-sm font-bold">
        Lời hứa với độc giả
        <textarea name="promise" maxLength={4000} className={TEXTAREA_CLASS} />
      </label>
      <label className="block text-sm font-bold">
        Payoff dự kiến
        <textarea name="expectedPayoff" maxLength={4000} className={TEXTAREA_CLASS} />
      </label>
      <label className="block text-sm font-bold">
        Ghi chú
        <textarea name="notes" maxLength={8000} className={TEXTAREA_CLASS} />
      </label>
      <EvidenceFields chapters={chapters} />
      <ActionMessage state={state} />
      <Button type="submit" disabled={isPending} className="rounded-full">
        {isPending ? "Đang lưu…" : "Thêm plot thread"}
      </Button>
    </form>
  );
}

export function FactStatusForm({
  storyId,
  factId,
  currentStatus,
}: {
  storyId: string;
  factId: string;
  currentStatus: ContinuityFactStatus;
}) {
  const [state, formAction, isPending] = useActionState(
    updateContinuityFactStatus,
    EMPTY_STUDIO_ACTION_STATE,
  );
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="factId" value={factId} />
      <select name="status" defaultValue={currentStatus} className={`${FIELD_CLASS} mt-0 w-auto min-w-44`}>
        {CONTINUITY_FACT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {FACT_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Đang lưu…" : "Cập nhật"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function ThreadStatusForm({
  storyId,
  threadId,
  currentStatus,
}: {
  storyId: string;
  threadId: string;
  currentStatus: ContinuityThreadStatus;
}) {
  const [state, formAction, isPending] = useActionState(
    updateContinuityThreadStatus,
    EMPTY_STUDIO_ACTION_STATE,
  );
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="threadId" value={threadId} />
      <select name="status" defaultValue={currentStatus} className={`${FIELD_CLASS} mt-0 w-auto min-w-44`}>
        {CONTINUITY_THREAD_STATUSES.map((status) => (
          <option key={status} value={status}>
            {THREAD_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Đang lưu…" : "Cập nhật"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

