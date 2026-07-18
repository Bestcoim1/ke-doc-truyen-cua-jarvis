"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  Focus,
  Menu,
  Minus,
  RotateCcw,
  Search,
  X,
  ZoomIn,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type GraphControlsProps = {
  showSections: boolean;
  showChapters: boolean;
  focusMode: boolean;
  onShowSectionsChange: (value: boolean) => void;
  onShowChaptersChange: (value: boolean) => void;
  onFocusModeChange: (value: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onResetLayout: () => void;
  onSearch: (query: string) => void;
  linkStoryControl: ReactNode;
};

function ControlsContent({
  showSections,
  showChapters,
  focusMode,
  onShowSectionsChange,
  onShowChaptersChange,
  onFocusModeChange,
  onZoomIn,
  onZoomOut,
  onFit,
  onResetLayout,
  onSearch,
  linkStoryControl,
}: GraphControlsProps) {
  const [query, setQuery] = useState("");

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(query.trim());
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submitSearch} className="flex gap-2">
        <label className="sr-only" htmlFor="graph-node-search">
          Tìm node theo tiêu đề
        </label>
        <input
          id="graph-node-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm tác phẩm, hồi, chương…"
          className="min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm"
          style={{
            background: "var(--kd-bg)",
            borderColor: "var(--kd-border)",
          }}
        />
        <Button type="submit" size="icon" aria-label="Tìm node">
          <Search size={16} />
        </Button>
      </form>

      <div className="grid grid-cols-4 gap-2" aria-label="Điều khiển thu phóng">
        <Button variant="outline" size="icon" onClick={onZoomIn} aria-label="Phóng to">
          <ZoomIn size={16} />
        </Button>
        <Button variant="outline" size="icon" onClick={onZoomOut} aria-label="Thu nhỏ">
          <Minus size={16} />
        </Button>
        <Button variant="outline" size="icon" onClick={onFit} aria-label="Vừa khung">
          <Focus size={16} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onResetLayout}
          aria-label="Reset bố cục"
        >
          <RotateCcw size={16} />
        </Button>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-extrabold">Hiển thị</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={showSections}
            onChange={(event) => onShowSectionsChange(event.target.checked)}
          />
          Section
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={showChapters}
            disabled={!showSections}
            onChange={(event) => onShowChaptersChange(event.target.checked)}
          />
          Chương
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={focusMode}
            onChange={(event) => onFocusModeChange(event.target.checked)}
          />
          Focus Mode kiểu Obsidian
        </label>
        {focusMode ? (
          <p className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
            Node đang chọn và các liên kết trực tiếp được làm nổi bật. Nhấp nền
            trống để bỏ focus.
          </p>
        ) : null}
        {!showSections ? (
          <p className="text-xs" style={{ color: "var(--kd-text-muted)" }}>
            Bật Section để hiển thị chương; tổ hợp không có Section bị vô hiệu để
            tránh node mồ côi.
          </p>
        ) : null}
      </fieldset>

      <div>
        <p className="text-sm font-extrabold">Chú giải</p>
        <ul className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <li className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full bg-[var(--kd-binding)]" /> Tác phẩm
          </li>
          <li className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[var(--kd-gilt)]" /> Section
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--kd-accent)]" /> Chương
          </li>
          <li className="flex items-center gap-2">
            <span className="h-0.5 w-6 bg-[var(--kd-text-muted)]" /> Quan hệ
          </li>
        </ul>
      </div>

      {linkStoryControl}
    </div>
  );
}

export function GraphControls(props: GraphControlsProps) {
  return (
    <>
      <aside
        className="absolute left-4 top-4 z-20 hidden w-80 rounded-3xl border p-4 shadow-xl backdrop-blur lg:block"
        style={{
          background: "color-mix(in srgb, var(--kd-surface) 92%, transparent)",
          borderColor: "var(--kd-border)",
        }}
        aria-label="Điều khiển graph"
      >
        <ControlsContent {...props} />
      </aside>

      <div className="absolute left-3 top-3 z-20 lg:hidden">
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <Button size="icon" aria-label="Mở điều khiển graph">
              <Menu size={18} />
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
            <Dialog.Content
              className="fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-y-auto rounded-t-3xl border p-5 outline-none"
              style={{
                background: "var(--kd-surface)",
                borderColor: "var(--kd-border)",
                paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
              }}
            >
              <div className="mb-4 flex items-center justify-between">
                <Dialog.Title className="text-lg font-extrabold">
                  Điều khiển graph
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="icon" aria-label="Đóng">
                    <X size={18} />
                  </Button>
                </Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">
                Tìm kiếm, lọc và điều khiển bố cục graph.
              </Dialog.Description>
              <ControlsContent {...props} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </>
  );
}
