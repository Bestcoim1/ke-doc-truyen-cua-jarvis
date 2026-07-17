import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ImportMethodPicker } from "@/components/import/import-method-picker";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export default function NewImportPage() {
  if (!isSupabaseConfigured) {
    return (
      <p
        className="max-w-sm p-6 text-sm"
        style={{ color: "var(--kd-text-muted)" }}
      >
        Supabase chưa được cấu hình — điền `.env.local` rồi tải lại.
      </p>
    );
  }

  return (
    <Suspense fallback={null}>
      <NewImportContent />
    </Suspense>
  );
}

async function NewImportContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth/login?next=/import/new");

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="mb-6">
        <p className="text-sm" style={{ color: "var(--kd-text-muted)" }}>
          Paste, tải một hoặc nhiều file, hoặc dùng Google Docs
        </p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
          Thêm tác phẩm
        </h1>
        <p
          className="mt-2 text-sm leading-6"
          style={{ color: "var(--kd-text-muted)" }}
        >
          Nội dung chỉ được tạo thành bản review. Thư viện chưa thay đổi cho tới
          khi bạn bấm commit.
        </p>
      </div>
      <div
        className="rounded-xl border p-4 sm:p-6"
        style={{
          background: "var(--kd-surface)",
          borderColor: "var(--kd-border)",
        }}
      >
        <ImportMethodPicker />
      </div>
    </div>
  );
}
