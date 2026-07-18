"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/telemetry";

import { getStoryHierarchyForGraph } from "./queries";
import {
  STORED_RELATIONSHIP_TYPES,
  type GraphActionState,
  type HierarchyLoadResult,
  type StoredRelationshipType,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RELATIONSHIP_TYPE_SET = new Set<string>(STORED_RELATIONSHIP_TYPES);

function errorState(message: string): GraphActionState {
  return { status: "error", message };
}

function successState(message: string): GraphActionState {
  return { status: "success", message };
}

function relationshipTypeFrom(value: FormDataEntryValue | null) {
  return typeof value === "string" && RELATIONSHIP_TYPE_SET.has(value)
    ? (value as StoredRelationshipType)
    : null;
}

function normalizedPair(sourceStoryId: string, targetStoryId: string) {
  const source = sourceStoryId.toLowerCase();
  const target = targetStoryId.toLowerCase();
  return source.localeCompare(target) <= 0
    ? { sourceStoryId: source, targetStoryId: target }
    : { sourceStoryId: target, targetStoryId: source };
}

function revalidateRelationshipPaths(sourceStoryId: string, targetStoryId: string) {
  revalidatePath(`/read/${sourceStoryId}/graph`);
  revalidatePath(`/read/${targetStoryId}/graph`);
  revalidatePath("/library/graphs");
}

async function getAuthenticatedContext() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  return { supabase, userId };
}

async function ownsStories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  storyIds: string[],
  activeOnly: boolean,
) {
  let query = supabase
    .from("stories")
    .select("id")
    .in("id", [...new Set(storyIds)])
    .eq("owner_id", userId);
  if (activeOnly) query = query.eq("status", "active");

  const { data, error } = await query;
  if (error) {
    logEvent("graph.story_ownership_query_error", { code: error.code });
    return false;
  }
  return data.length === new Set(storyIds).size;
}

export async function createStoryRelationship(
  _previousState: GraphActionState,
  formData: FormData,
): Promise<GraphActionState> {
  const sourceRaw = formData.get("sourceStoryId");
  const targetRaw = formData.get("targetStoryId");
  const relationshipType = relationshipTypeFrom(
    formData.get("relationshipType"),
  );
  if (
    typeof sourceRaw !== "string" ||
    typeof targetRaw !== "string" ||
    !UUID_RE.test(sourceRaw) ||
    !UUID_RE.test(targetRaw) ||
    sourceRaw.toLowerCase() === targetRaw.toLowerCase() ||
    !relationshipType
  ) {
    return errorState("Quan hệ tác phẩm không hợp lệ.");
  }

  let sourceStoryId = sourceRaw.toLowerCase();
  let targetStoryId = targetRaw.toLowerCase();
  const { supabase, userId } = await getAuthenticatedContext();
  if (!userId) return errorState("Phiên đăng nhập đã hết hạn.");

  if (
    !(await ownsStories(
      supabase,
      userId,
      [sourceStoryId, targetStoryId],
      true,
    ))
  ) {
    return errorState("Không thể liên kết các tác phẩm này.");
  }

  if (relationshipType === "related") {
    ({ sourceStoryId, targetStoryId } = normalizedPair(
      sourceStoryId,
      targetStoryId,
    ));
  }

  const { data, error } = await supabase
    .from("story_relationships")
    .insert({
      source_story_id: sourceStoryId,
      target_story_id: targetStoryId,
      relationship_type: relationshipType,
    })
    .select("id")
    .single();

  if (error || !data) {
    logEvent("graph.relationship_create_error", {
      code: error?.code ?? "unknown",
      sourceStoryId,
      targetStoryId,
    });
    return errorState(
      error?.code === "23505"
        ? "Hai tác phẩm đã có quan hệ."
        : "Không thể tạo quan hệ. Vui lòng thử lại.",
    );
  }

  logEvent("graph.relationship_created", {
    relationshipId: data.id,
    relationshipType,
    sourceStoryId,
    targetStoryId,
  });
  revalidateRelationshipPaths(sourceStoryId, targetStoryId);
  return successState("Đã liên kết hai tác phẩm.");
}

export async function updateStoryRelationship(
  _previousState: GraphActionState,
  formData: FormData,
): Promise<GraphActionState> {
  const relationshipIdRaw = formData.get("relationshipId");
  const relationshipType = relationshipTypeFrom(
    formData.get("relationshipType"),
  );
  const reverseDirection = formData.get("reverseDirection") === "true";
  if (
    typeof relationshipIdRaw !== "string" ||
    !UUID_RE.test(relationshipIdRaw) ||
    !relationshipType
  ) {
    return errorState("Quan hệ tác phẩm không hợp lệ.");
  }
  const relationshipId = relationshipIdRaw.toLowerCase();

  const { supabase, userId } = await getAuthenticatedContext();
  if (!userId) return errorState("Phiên đăng nhập đã hết hạn.");

  const { data: current, error: currentError } = await supabase
    .from("story_relationships")
    .select("source_story_id, target_story_id")
    .eq("id", relationshipId)
    .maybeSingle();
  if (currentError || !current) {
    logEvent("graph.relationship_update_lookup_error", {
      code: currentError?.code ?? "not_found",
      relationshipId,
    });
    return errorState("Không thể cập nhật quan hệ này.");
  }

  if (
    !(await ownsStories(
      supabase,
      userId,
      [current.source_story_id, current.target_story_id],
      true,
    ))
  ) {
    return errorState("Không thể cập nhật quan hệ này.");
  }

  let sourceStoryId = reverseDirection
    ? current.target_story_id
    : current.source_story_id;
  let targetStoryId = reverseDirection
    ? current.source_story_id
    : current.target_story_id;
  if (relationshipType === "related") {
    ({ sourceStoryId, targetStoryId } = normalizedPair(
      sourceStoryId,
      targetStoryId,
    ));
  }

  const { error, count } = await supabase
    .from("story_relationships")
    .update(
      {
        source_story_id: sourceStoryId,
        target_story_id: targetStoryId,
        relationship_type: relationshipType,
      },
      { count: "exact" },
    )
    .eq("id", relationshipId);

  if (error || !count) {
    logEvent("graph.relationship_update_error", {
      code: error?.code ?? "not_found",
      relationshipId,
    });
    return errorState("Không thể cập nhật quan hệ. Vui lòng thử lại.");
  }

  logEvent("graph.relationship_updated", {
    relationshipId,
    relationshipType,
    reverseDirection,
  });
  revalidateRelationshipPaths(sourceStoryId, targetStoryId);
  return successState("Đã cập nhật quan hệ.");
}

export async function deleteStoryRelationship(
  _previousState: GraphActionState,
  formData: FormData,
): Promise<GraphActionState> {
  const relationshipIdRaw = formData.get("relationshipId");
  if (
    typeof relationshipIdRaw !== "string" ||
    !UUID_RE.test(relationshipIdRaw)
  ) {
    return errorState("Quan hệ tác phẩm không hợp lệ.");
  }
  const relationshipId = relationshipIdRaw.toLowerCase();

  const { supabase, userId } = await getAuthenticatedContext();
  if (!userId) return errorState("Phiên đăng nhập đã hết hạn.");

  const { data: current, error: currentError } = await supabase
    .from("story_relationships")
    .select("source_story_id, target_story_id")
    .eq("id", relationshipId)
    .maybeSingle();
  if (currentError || !current) {
    return errorState("Không thể xoá quan hệ này.");
  }
  if (
    !(await ownsStories(
      supabase,
      userId,
      [current.source_story_id, current.target_story_id],
      false,
    ))
  ) {
    return errorState("Không thể xoá quan hệ này.");
  }

  const { error, count } = await supabase
    .from("story_relationships")
    .delete({ count: "exact" })
    .eq("id", relationshipId);
  if (error || !count) {
    logEvent("graph.relationship_delete_error", {
      code: error?.code ?? "not_found",
      relationshipId,
    });
    return errorState("Không thể xoá quan hệ. Vui lòng thử lại.");
  }

  logEvent("graph.relationship_deleted", { relationshipId });
  revalidateRelationshipPaths(
    current.source_story_id,
    current.target_story_id,
  );
  return successState("Đã xoá quan hệ.");
}

export async function loadStoryHierarchyForGraph(
  storyIdRaw: string,
): Promise<HierarchyLoadResult> {
  if (!UUID_RE.test(storyIdRaw)) {
    return { ok: false, message: "Không thể tải tác phẩm này." };
  }

  const { supabase, userId } = await getAuthenticatedContext();
  if (!userId) {
    return { ok: false, message: "Không thể tải tác phẩm này." };
  }

  const result = await getStoryHierarchyForGraph(
    supabase,
    userId,
    storyIdRaw.toLowerCase(),
  );
  if (!result.data) {
    logEvent("graph.hierarchy_load_error", {
      code: result.error ?? "not_found",
      storyId: storyIdRaw,
    });
    return { ok: false, message: "Không thể tải tác phẩm này." };
  }
  return { ok: true, hierarchy: result.data };
}
