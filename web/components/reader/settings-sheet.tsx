"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { FONT_SIZE_STEPS, LINE_HEIGHT_STEPS, type ReadingSettings } from "@/lib/reader/types";

export function SettingsSheet({
  settings,
  onUpdate,
  onClose,
}: {
  settings: ReadingSettings;
  onUpdate: (patch: Partial<ReadingSettings>) => void;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(open: boolean) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-30 rounded-t-2xl p-5 shadow-xl outline-none"
          style={{
            background: "var(--kd-surface)",
            color: "var(--kd-text)",
            paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title asChild>
              <span className="text-base font-bold">Tuỳ chỉnh đọc</span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Đóng"
                className="flex h-11 w-11 items-center justify-center rounded-md"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-xs font-bold uppercase" style={{ color: "var(--kd-text-muted)" }}>
              Cỡ chữ
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cỡ chữ">
              {FONT_SIZE_STEPS.map((size, step) => (
                <button
                  key={size}
                  role="radio"
                  aria-checked={settings.fontSizeStep === step}
                  className="inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold"
                  style={
                    settings.fontSizeStep === step
                      ? { background: "var(--kd-accent)", color: "var(--kd-accent-foreground)" }
                      : { background: "var(--kd-bg)" }
                  }
                  onClick={() => onUpdate({ fontSizeStep: step })}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-xs font-bold uppercase" style={{ color: "var(--kd-text-muted)" }}>
              Khoảng cách dòng
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Khoảng cách dòng">
              {LINE_HEIGHT_STEPS.map((lh) => (
                <button
                  key={lh}
                  role="radio"
                  aria-checked={settings.lineHeight === lh}
                  className="inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold"
                  style={
                    settings.lineHeight === lh
                      ? { background: "var(--kd-accent)", color: "var(--kd-accent-foreground)" }
                      : { background: "var(--kd-bg)" }
                  }
                  onClick={() => onUpdate({ lineHeight: lh })}
                >
                  {lh.toFixed(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase" style={{ color: "var(--kd-text-muted)" }}>
              Giao diện
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Giao diện">
              {(
                [
                  ["light", "Sáng"],
                  ["dark", "Tối"],
                  ["sepia", "Sepia"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="radio"
                  aria-checked={settings.theme === key}
                  className="inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold"
                  style={
                    settings.theme === key
                      ? { background: "var(--kd-accent)", color: "var(--kd-accent-foreground)" }
                      : { background: "var(--kd-bg)" }
                  }
                  onClick={() => onUpdate({ theme: key })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
