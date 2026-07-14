"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: boolean };

export async function updateProfile(prevState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const displayName = formData.get("displayName") as string;
  let avatarUrl = formData.get("avatarUrl") as string;
  const avatarFile = formData.get("avatarFile") as File | null;

  if (avatarFile && avatarFile.size > 0) {
    if (avatarFile.size > 5242880) return { error: "Ảnh quá lớn, vui lòng chọn file dưới 5MB." };
    
    const ext = avatarFile.name.split('.').pop() || 'jpg';
    const filePath = `${user.id}/avatars/${Date.now()}.${ext}`;
    
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, avatarFile, { upsert: true });
      
    if (uploadError) return { error: "Lỗi tải ảnh lên: " + uploadError.message };
    
    const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(filePath);
    avatarUrl = publicUrlData.publicUrl;
  }

  const { error } = await supabase.auth.updateUser({
    data: { 
      display_name: displayName,
      avatar_url: avatarUrl 
    },
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updatePassword(prevState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const password = formData.get("password") as string;

  if (!password || password.length < 6) {
    return { error: "Mật khẩu phải có ít nhất 6 ký tự." };
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
