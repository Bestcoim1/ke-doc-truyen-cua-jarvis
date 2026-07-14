"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "system", label: "Theo máy", icon: Monitor },
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
] as const;

export function AppThemeControl() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-full border p-1"
      style={{ borderColor: "var(--kd-border)", background: "var(--kd-bg)" }}
      role="radiogroup"
      aria-label="Theme ứng dụng"
    >
      {OPTIONS.map((option) => {
        const active = (theme ?? "system") === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(option.value)}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-3 text-sm font-bold transition-colors",
              active ? "text-[var(--kd-accent-foreground)]" : "text-[var(--kd-text-muted)]",
            )}
            style={active ? { background: "var(--kd-binding)" } : undefined}
          >
            <Icon size={16} />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
