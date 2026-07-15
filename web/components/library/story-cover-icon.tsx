"use client";

import { useState, useTransition } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { updateStoryCoverColor } from "@/lib/library/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const COVER_COLORS = [
  { value: "#3b82f6", label: "Xanh dương" },
  { value: "#ef4444", label: "Đỏ" },
  { value: "#10b981", label: "Xanh lục" },
  { value: "#f59e0b", label: "Vàng" },
  { value: "#8b5cf6", label: "Tím" },
  { value: "#ec4899", label: "Hồng" },
  { value: "#64748b", label: "Xám" },
  { value: "linear-gradient(160deg, var(--kd-binding), color-mix(in srgb, var(--kd-binding) 55%, #000))", label: "Mặc định" },
];

export function StoryCoverIcon({
  storyId,
  initialCoverUrl,
}: {
  storyId: string;
  initialCoverUrl: string | null;
}) {
  const defaultBg = "linear-gradient(160deg, var(--kd-binding), color-mix(in srgb, var(--kd-binding) 55%, #000))";
  const [optimisticColor, setOptimisticColor] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const coverColor = optimisticColor || initialCoverUrl || defaultBg;

  const handleColorChange = (color: string) => {
    setOptimisticColor(color);
    setIsOpen(false);
    startTransition(async () => {
      try {
        const result = await updateStoryCoverColor(storyId, color);
        if (result.error) {
          alert(result.error);
          setOptimisticColor(null);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        alert("Lỗi khi cập nhật màu: " + msg);
        setOptimisticColor(null);
      }
    });
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="group relative z-10 flex h-24 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border shadow-sm transition-transform hover:scale-105 hover:shadow-md focus:outline-none"
          style={{
            background: coverColor,
            borderColor: "color-mix(in srgb, var(--kd-gilt) 45%, transparent)",
            color: "var(--kd-accent-foreground)",
          }}
          aria-label="Đổi màu bìa truyện"
        >
          {isPending ? (
            <Loader2 className="animate-spin text-white/80" size={24} />
          ) : (
            <BookOpen className="text-white/80 transition-transform group-hover:scale-110" size={26} />
          )}
        </button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="start" className="w-48 p-2">
        <div className="mb-2 px-2 text-xs font-semibold text-muted-foreground">Chọn màu bìa</div>
        <div className="grid grid-cols-4 gap-2 p-1">
          {COVER_COLORS.map((c) => (
            <DropdownMenuItem
              key={c.value}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full p-0"
              onClick={(e) => {
                e.preventDefault();
                handleColorChange(c.value);
              }}
            >
              <div 
                className={cn("h-6 w-6 rounded-full border shadow-sm transition-transform hover:scale-110", coverColor === c.value && "ring-2 ring-primary ring-offset-2")} 
                style={{ background: c.value }}
                title={c.label}
              />
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
