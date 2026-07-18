"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, Trash2, X } from "lucide-react";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  deleteStoryRelationship,
  updateStoryRelationship,
} from "@/lib/graph/actions";
import {
  PERSPECTIVE_LABELS,
  RELATIONSHIP_LABELS,
  relationshipFromPerspective,
} from "@/lib/graph/transform";
import {
  EMPTY_GRAPH_ACTION_STATE,
  STORED_RELATIONSHIP_TYPES,
  type GraphActionState,
  type StoredRelationshipType,
  type StoryRelationship,
} from "@/lib/graph/types";

export function ManageRelationshipDialog({
  relationship,
  currentStoryId,
  currentStoryTitle,
  otherStoryTitle,
  onOptimisticUpdate,
  onOptimisticDelete,
}: {
  relationship: StoryRelationship;
  currentStoryId: string;
  currentStoryTitle: string;
  otherStoryTitle: string;
  onOptimisticUpdate?: (
    relationshipType: StoredRelationshipType,
    reverseDirection: boolean,
  ) => (() => void) | void;
  onOptimisticDelete?: () => (() => void) | void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [relationshipType, setRelationshipType] =
    useState<StoredRelationshipType>(relationship.relationshipType);
  const perspective = relationshipFromPerspective(relationship, currentStoryId);

  const [updateState, updateAction, isUpdating] = useActionState(
    async (previousState: GraphActionState, formData: FormData) => {
      const nextType = String(
        formData.get("relationshipType") ?? relationship.relationshipType,
      ) as StoredRelationshipType;
      const reverse = formData.get("reverseDirection") === "true";
      const rollback = onOptimisticUpdate?.(nextType, reverse);
      const result = await updateStoryRelationship(previousState, formData);
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

  const [deleteState, deleteAction, isDeleting] = useActionState(
    async (previousState: GraphActionState, formData: FormData) => {
      const rollback = onOptimisticDelete?.();
      const result = await deleteStoryRelationship(previousState, formData);
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
        <Button variant="outline" size="sm">
          <Pencil size={14} />
          Quản lý
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
                Quản lý quan hệ
              </Dialog.Title>
              <Dialog.Description
                className="mt-1 text-sm"
                style={{ color: "var(--kd-text-muted)" }}
              >
                {otherStoryTitle} hiện là “
                {PERSPECTIVE_LABELS[perspective.perspective]}” khi nhìn từ tác
                phẩm này.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Đóng">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>

          <form action={updateAction} className="mt-5 space-y-4">
            <input
              type="hidden"
              name="relationshipId"
              value={relationship.id}
            />
            <label className="block text-sm font-bold">
              Loại quan hệ lưu trữ
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
            {relationshipType !== "related" ? (
              <label className="flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-semibold">
                <input type="checkbox" name="reverseDirection" value="true" />
                Đảo chiều nguồn và đích
              </label>
            ) : null}
            {updateState.status === "error" ? (
              <p role="alert" className="text-sm text-red-600">
                {updateState.message}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-between gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive">
                    <Trash2 size={15} />
                    Xoá quan hệ
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-[var(--kd-border)] bg-[var(--kd-surface)] text-[var(--kd-text)]">
                  <form action={deleteAction}>
                    <input
                      type="hidden"
                      name="relationshipId"
                      value={relationship.id}
                    />
                    <AlertDialogHeader>
                      <AlertDialogTitle>Xoá quan hệ này?</AlertDialogTitle>
                      <AlertDialogDescription className="text-[var(--kd-text-muted)]">
                        Quan hệ giữa “{currentStoryTitle}” và “{otherStoryTitle}”
                        sẽ bị xoá. Hai tác phẩm vẫn được giữ nguyên.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteState.status === "error" ? (
                      <p role="alert" className="mt-3 text-sm text-red-600">
                        {deleteState.message}
                      </p>
                    ) : null}
                    <AlertDialogFooter className="mt-5">
                      <AlertDialogCancel>Giữ lại</AlertDialogCancel>
                      <AlertDialogAction
                        type="submit"
                        variant="destructive"
                        disabled={isDeleting}
                      >
                        {isDeleting ? "Đang xoá…" : "Xoá quan hệ"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </form>
                </AlertDialogContent>
              </AlertDialog>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">
                    Hủy
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? "Đang lưu…" : "Lưu thay đổi"}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
