"use server";

import { revalidatePath } from "next/cache";
import { passwordLengthError } from "@/lib/auth/password-policy";
import {
  avatarPathFromPublicUrl,
  MAX_AVATAR_BYTES,
  validateAvatarUpload,
} from "@/lib/settings/avatar-validation";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/telemetry";

export type FormState = { error?: string; success?: boolean };

export async function updateProfile(_prevState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const displayNameValue = formData.get("displayName");
  const displayName = typeof displayNameValue === "string" ? displayNameValue.trim() : "";
  if (displayName.length > 80) return { error: "Bút danh không được vượt quá 80 ký tự." };

  const currentAvatarUrl =
    typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : "";
  let avatarUrl = currentAvatarUrl;
  const avatarValue = formData.get("avatarFile");
  const avatarFile = avatarValue instanceof File ? avatarValue : null;
  let uploadedPath: string | null = null;

  if (avatarFile && avatarFile.size > 0) {
    if (avatarFile.size > MAX_AVATAR_BYTES) {
      return { error: "Ảnh quá lớn, vui lòng chọn file dưới 5MB." };
    }

    const bytes = new Uint8Array(await avatarFile.arrayBuffer());
    const format = validateAvatarUpload(bytes, avatarFile.type);
    if (!format) {
      return { error: "Ảnh không hợp lệ. Chỉ chấp nhận JPEG, PNG, WebP, GIF hoặc AVIF." };
    }

    uploadedPath = `${user.id}/avatars/${crypto.randomUUID()}.${format.extension}`;
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(uploadedPath, bytes, {
        contentType: format.contentType,
        upsert: false,
      });

    if (uploadError) return { error: "Lỗi tải ảnh lên: " + uploadError.message };

    const { data: publicUrlData } = supabase.storage.from("media").getPublicUrl(uploadedPath);
    avatarUrl = publicUrlData.publicUrl;
  }

  const { error } = await supabase.auth.updateUser({
    data: { 
      display_name: displayName,
      avatar_url: avatarUrl 
    },
  });

  if (error) {
    if (uploadedPath) {
      const { error: cleanupError } = await supabase.storage.from("media").remove([uploadedPath]);
      if (cleanupError) logEvent("settings.avatar_cleanup_error", { code: cleanupError.name });
    }
    return { error: error.message };
  }

  if (uploadedPath) {
    const oldPath = avatarPathFromPublicUrl(currentAvatarUrl, user.id);
    if (oldPath && oldPath !== uploadedPath) {
      const { error: cleanupError } = await supabase.storage.from("media").remove([oldPath]);
      if (cleanupError) logEvent("settings.avatar_cleanup_error", { code: cleanupError.name });
    }
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updatePassword(_prevState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const passwordValue = formData.get("password");
  const password = typeof passwordValue === "string" ? passwordValue : "";

  const lengthError = passwordLengthError(password);
  if (lengthError) return { error: lengthError };

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
