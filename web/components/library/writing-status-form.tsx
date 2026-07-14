"use client";

import { useActionState, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateStoryWritingStatus } from "@/lib/library/actions";
import {
  WRITING_STATUS_OPTIONS,
  getWritingStatusMeta,
  type WritingStatus,
} from "@/lib/writing-status";

const INITIAL_STATE = { error: null, message: null };

export function WritingStatusForm({
  storyId,
  writingStatus,
}: {
  storyId: string;
  writingStatus: WritingStatus;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const statusInputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState(updateStoryWritingStatus, INITIAL_STATE);
  const meta = getWritingStatusMeta(writingStatus);

  function submitStatus(nextStatus: WritingStatus) {
    if (isPending || nextStatus === writingStatus) return;
    if (statusInputRef.current) {
      statusInputRef.current.value = nextStatus;
    }
    formRef.current?.requestSubmit();
  }

  return (
    <div className="space-y-1">
      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="storyId" value={storyId} />
        <input ref={statusInputRef} type="hidden" name="writingStatus" defaultValue={writingStatus} />
      </form>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isPending}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-full border px-4 text-left text-sm font-extrabold outline-none transition-colors disabled:opacity-60"
            style={{
              borderColor: "var(--kd-border)",
              background: "color-mix(in srgb, var(--kd-surface) 74%, transparent)",
              color: "var(--kd-text)",
            }}
            aria-label="Tiến trình sáng tác"
            title={meta.description}
          >
            <span className="truncate">{isPending ? "Đang lưu..." : meta.label}</span>
            <ChevronDown className="shrink-0" size={16} style={{ color: "var(--kd-text-muted)" }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-64 rounded-2xl border p-1 shadow-2xl"
          style={{
            background: "var(--kd-surface-raised)",
            borderColor: "var(--kd-border)",
            color: "var(--kd-text)",
          }}
        >
          {WRITING_STATUS_OPTIONS.map((option) => {
            const selected = option.value === writingStatus;

            return (
              <DropdownMenuItem
                key={option.value}
                disabled={isPending}
                onSelect={() => submitStatus(option.value)}
                className="cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 focus:bg-transparent focus:text-[var(--kd-text)]"
                style={selected ? { background: "var(--kd-bg)" } : undefined}
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: selected ? "var(--kd-binding)" : "transparent",
                    color: selected ? "var(--kd-accent-foreground)" : "var(--kd-text-muted)",
                    border: selected ? "none" : "1px solid var(--kd-border)",
                  }}
                >
                  {selected ? <Check size={13} /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-5" style={{ color: "var(--kd-text-muted)" }}>
                    {option.description}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
