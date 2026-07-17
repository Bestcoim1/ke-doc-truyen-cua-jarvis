"use client";

import { useActionState, useState } from "react";
import { updateProfile, updatePassword } from "@/app/(kd)/settings/actions";
import type { FormState } from "@/app/(kd)/settings/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: FormState = {};

export function ProfileForm({
  initialDisplayName,
  initialAvatarUrl,
}: {
  initialDisplayName: string;
  initialAvatarUrl: string;
}) {
  const [profileState, profileAction, profilePending] = useActionState(
    updateProfile,
    INITIAL_STATE
  );
  
  const [passwordState, passwordAction, passwordPending] = useActionState(
    updatePassword,
    INITIAL_STATE
  );

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarPreview(URL.createObjectURL(file));
    } else {
      setAvatarPreview(null);
    }
  };

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Cập nhật hồ sơ */}
      <form action={profileAction} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-bold mb-1" htmlFor="displayName">
            Bút danh (Tên hiển thị)
          </label>
          <input
            id="displayName"
            name="displayName"
            defaultValue={initialDisplayName}
            placeholder="Ví dụ: Nam Cao"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--kd-border)",
              background: "var(--kd-bg)",
              color: "var(--kd-text)",
            }}
          />
        </div>
        
        <div>
          <label className="block text-sm font-bold mb-3">
            Ảnh đại diện
          </label>
          <div className="flex items-center gap-4">
            {/* Preview */}
            <div 
              className="h-16 w-16 shrink-0 rounded-full bg-cover bg-center border shadow-sm"
              style={{ 
                backgroundImage: `url(${avatarPreview || initialAvatarUrl || '/placeholder.svg'})`,
                borderColor: "var(--kd-border)"
              }}
            />
            <div className="flex flex-col gap-2 flex-1">
              <input
                id="avatarFile"
                name="avatarFile"
                type="file"
                accept="image/png, image/jpeg, image/webp, image/gif"
                onChange={handleAvatarChange}
                className="text-xs file:mr-3 file:rounded-full file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
              />
              <input
                id="avatarUrl"
                name="avatarUrl"
                type="hidden"
                value={initialAvatarUrl}
              />
            </div>
          </div>
        </div>

        <Button
          type="submit"
          disabled={profilePending}
          className="rounded-full w-fit mt-2"
        >
          {profilePending ? "Đang lưu..." : "Cập nhật hồ sơ"}
        </Button>
        {profileState?.error && (
          <p className="text-sm text-red-600">{profileState.error}</p>
        )}
        {profileState?.success && (
          <p className="text-sm text-green-600 font-semibold">Đã lưu hồ sơ!</p>
        )}
      </form>

      {/* Đổi mật khẩu */}
      <form action={passwordAction} className="flex flex-col gap-4 border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6" style={{ borderColor: "var(--kd-border)" }}>
        <div>
          <label className="block text-sm font-bold mb-1" htmlFor="password">
            Đổi Mật khẩu mới
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={6}
            placeholder="Tối thiểu 6 ký tự"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--kd-border)",
              background: "var(--kd-bg)",
              color: "var(--kd-text)",
            }}
          />
        </div>

        <Button
          type="submit"
          disabled={passwordPending}
          variant="outline"
          className="rounded-full w-fit mt-2"
        >
          {passwordPending ? "Đang cập nhật..." : "Đổi mật khẩu"}
        </Button>
        {passwordState?.error && (
          <p className="text-sm text-red-600">{passwordState.error}</p>
        )}
        {passwordState?.success && (
          <p className="text-sm text-green-600 font-semibold">Mật khẩu đã được đổi!</p>
        )}
      </form>
    </div>
  );
}
