"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, X } from "lucide-react";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { renameStory } from "@/lib/library/actions";
import { STORY_TITLE_MAX_LENGTH } from "@/lib/library/story-title";

const INITIAL_STATE = { error: null, message: null };

export function RenameStoryDialog({
  storyId,
  storyTitle,
}: {
  storyId: string;
  storyTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(storyTitle);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setTitle(storyTitle);
      setError(null);
    }
    setOpen(nextOpen);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await renameStory(INITIAL_STATE, formData);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(result.message ?? "Đã đổi tên tác phẩm.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full"
          aria-label={`Đổi tên ${storyTitle}`}
          title="Đổi tên tác phẩm"
        >
          <Pencil size={15} />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border p-5 shadow-2xl outline-none"
          style={{
            background: "var(--kd-surface)",
            borderColor: "var(--kd-border)",
            color: "var(--kd-text)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-xl font-extrabold">
                Đổi tên tác phẩm
              </Dialog.Title>
              <Dialog.Description
                className="mt-1 text-sm leading-6"
                style={{ color: "var(--kd-text-muted)" }}
              >
                Tên mới sẽ được hiển thị trong Thư viện, Reader, Search và Graph.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Đóng"
                disabled={isPending}
              >
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <input type="hidden" name="storyId" value={storyId} />
            <label className="block text-sm font-bold" htmlFor={`story-title-${storyId}`}>
              Tên tác phẩm
            </label>
            <input
              id={`story-title-${storyId}`}
              name="title"
              type="text"
              required
              minLength={1}
              maxLength={STORY_TITLE_MAX_LENGTH}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (error) setError(null);
              }}
              autoFocus
              disabled={isPending}
              className="min-h-11 w-full rounded-xl border px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{
                background: "var(--kd-bg)",
                borderColor: "var(--kd-border)",
              }}
            />
            <div className="flex items-start justify-between gap-3 text-xs">
              <div>
                {error ? (
                  <p role="alert" className="text-red-600">
                    {error}
                  </p>
                ) : null}
              </div>
              <span style={{ color: "var(--kd-text-muted)" }}>
                {title.length}/{STORY_TITLE_MAX_LENGTH}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" disabled={isPending}>
                  Hủy
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={isPending || title.trim().length === 0}>
                {isPending ? "Đang lưu…" : "Lưu tên mới"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
