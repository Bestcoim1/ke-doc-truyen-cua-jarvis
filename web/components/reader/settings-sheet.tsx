"use client";

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
    <>
      <div className="absolute inset-0 z-20 bg-black/40" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl p-5 shadow-xl"
        style={{ background: "var(--kd-surface)", color: "var(--kd-text)" }}
        role="dialog"
        aria-label="Tuỳ chỉnh đọc"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-bold">Tuỳ chỉnh đọc</span>
          <button onClick={onClose} aria-label="Đóng" className="rounded-md p-1.5">
            <X size={18} />
          </button>
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
                className="rounded-full px-4 py-2 text-sm font-semibold"
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
                className="rounded-full px-4 py-2 text-sm font-semibold"
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
                className="rounded-full px-4 py-2 text-sm font-semibold"
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
      </div>
    </>
  );
}
