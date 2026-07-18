"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Link2, X } from "lucide-react";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createStoryRelationship } from "@/lib/graph/actions";
import { RELATIONSHIP_LABELS } from "@/lib/graph/transform";
import {
  EMPTY_GRAPH_ACTION_STATE,
  STORED_RELATIONSHIP_TYPES,
  type GraphActionState,
  type StoredRelationshipType,
  type StoryOption,
} from "@/lib/graph/types";

const TYPE_DESCRIPTIONS: Record<StoredRelationshipType, string> = {
  sequel:
    "Tác phẩm hiện tại là phần trước; tác phẩm được chọn là phần tiếp theo.",
  spinoff:
    "Tác phẩm hiện tại là tác phẩm gốc; tác phẩm được chọn là phần phái sinh.",
  side_story:
    "Tác phẩm hiện tại là truyện chính; tác phẩm được chọn là ngoại truyện.",
  adaptation:
    "Tác phẩm hiện tại là nguyên tác; tác phẩm được chọn là bản chuyển thể.",
  related: "Hai tác phẩm có liên quan, không phân biệt hướng.",
};

export function LinkStoryDialog({
  currentStory,
  availableStories,
  onOptimisticCreate,
}: {
  currentStory: StoryOption;
  availableStories: StoryOption[];
  onOptimisticCreate?: (
    targetStory: StoryOption,
    relationshipType: StoredRelationshipType,
  ) => (() => void) | void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [relationshipType, setRelationshipType] =
    useState<StoredRelationshipType>("sequel");

  const [state, formAction, isPending] = useActionState(
    async (previousState: GraphActionState, formData: FormData) => {
      const targetId = String(formData.get("targetStoryId") ?? "");
      const targetStory = availableStories.find((story) => story.id === targetId);
      const selectedType = String(
        formData.get("relationshipType") ?? "",
      ) as StoredRelationshipType;
      const rollback = targetStory
        ? onOptimisticCreate?.(targetStory, selectedType)
        : undefined;
      const result = await createStoryRelationship(previousState, formData);
      if (result.status === "error") {
        rollback?.();
        toast.error(result.message);
      } else {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    EMPTY_GRAPH_ACTION_STATE,
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button className="min-h-11 rounded-full">
          <Link2 size={16} />
          Liên kết tác phẩm
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
                Liên kết tác phẩm
              </Dialog.Title>
              <Dialog.Description
                className="mt-1 text-sm"
                style={{ color: "var(--kd-text-muted)" }}
              >
                Tạo một quan hệ từ “{currentStory.title}”.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Đóng">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>

          {availableStories.length === 0 ? (
            <p
              className="mt-5 rounded-2xl border p-4 text-sm"
              style={{
                borderColor: "var(--kd-border)",
                color: "var(--kd-text-muted)",
              }}
            >
              Không còn tác phẩm đang hoạt động nào có thể liên kết.
            </p>
          ) : (
            <form action={formAction} className="mt-5 space-y-4">
              <input
                type="hidden"
                name="sourceStoryId"
                value={currentStory.id}
              />
              <label className="block text-sm font-bold">
                Tác phẩm đích
                <select
                  required
                  name="targetStoryId"
                  className="mt-2 min-h-11 w-full rounded-xl border px-3"
                  style={{
                    background: "var(--kd-bg)",
                    borderColor: "var(--kd-border)",
                  }}
                >
                  {availableStories.map((story) => (
                    <option key={story.id} value={story.id}>
                      {story.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-bold">
                Loại quan hệ
                <select
                  name="relationshipType"
                  value={relationshipType}
                  onChange={(event) =>
                    setRelationshipType(
                      event.target.value as StoredRelationshipType,
                    )
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border px-3"
                  style={{
                    background: "var(--kd-bg)",
                    borderColor: "var(--kd-border)",
                  }}
                >
                  {STORED_RELATIONSHIP_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {RELATIONSHIP_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <p
                className="rounded-xl p-3 text-sm leading-6"
                style={{
                  background:
                    "color-mix(in srgb, var(--kd-gilt) 10%, transparent)",
                  color: "var(--kd-text-muted)",
                }}
              >
                {TYPE_DESCRIPTIONS[relationshipType]}
              </p>
              {state.status === "error" ? (
                <p role="alert" className="text-sm text-red-600">
                  {state.message}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">
                    Hủy
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Đang liên kết…" : "Tạo quan hệ"}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
