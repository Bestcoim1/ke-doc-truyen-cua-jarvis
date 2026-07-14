import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, BookOpen, FileClock, ShieldCheck } from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import { ProfileForm } from "@/components/settings/profile-form";
import { AppThemeControl } from "@/components/settings/app-theme-control";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export default async function SettingsPage() {
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

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const userId = user?.sub as string | undefined;
  if (!userId) redirect("/auth/login?next=/settings");
  const userEmail = user?.email ?? "Tài khoản đã đăng nhập";

  const [activeStories, archivedStories, pendingImports] = await Promise.all([
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("status", "active"),
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("status", "archived"),
    supabase
      .from("import_jobs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("status", "needs_review"),
  ]);

  const cards = [
    {
      label: "Tác phẩm đang đọc",
      value: activeStories.count ?? 0,
      icon: BookOpen,
    },
    { label: "Đã lưu trữ", value: archivedStories.count ?? 0, icon: Archive },
    {
      label: "Bản nháp chờ review",
      value: pendingImports.count ?? 0,
      icon: FileClock,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--kd-gilt)" }}
        >
          Account & app
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Cài đặt
        </h1>
        <p
          className="mt-3 max-w-2xl text-sm leading-6"
          style={{ color: "var(--kd-text-muted)" }}
        >
          Nơi gom các tuỳ chọn cấp ứng dụng. Tuỳ chỉnh chữ khi đọc vẫn nằm trong
          nút Aa của Reader.
        </p>
      </div>

      <section
        className="mt-6 rounded-3xl border p-5"
        style={{
          background: "var(--kd-surface)",
          borderColor: "var(--kd-border)",
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} style={{ color: "var(--kd-binding)" }} />
              <h2 className="font-extrabold">Tài khoản</h2>
            </div>
            <p
              className="mt-1 truncate text-sm"
              style={{ color: "var(--kd-text-muted)" }}
            >
              {userEmail}
            </p>
          </div>
          <LogoutButton />
        </div>
        <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--kd-border)" }}>
          <ProfileForm
            initialDisplayName={user?.user_metadata?.display_name || ""}
            initialAvatarUrl={user?.user_metadata?.avatar_url || ""}
          />
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-3xl border p-5"
              style={{
                background: "var(--kd-surface)",
                borderColor: "var(--kd-border)",
              }}
            >
              <Icon size={20} style={{ color: "var(--kd-gilt)" }} />
              <div className="mt-3 text-3xl font-extrabold">{card.value}</div>
              <div
                className="mt-1 text-sm"
                style={{ color: "var(--kd-text-muted)" }}
              >
                {card.label}
              </div>
            </div>
          );
        })}
      </section>

      <section
        className="mt-4 rounded-3xl border p-5"
        style={{
          background: "var(--kd-surface)",
          borderColor: "var(--kd-border)",
        }}
      >
        <h2 className="font-extrabold">Theme ứng dụng</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--kd-text-muted)" }}>
          Đổi giao diện Library/Search/Settings. Reader vẫn có theme đọc riêng
          để không làm mất nhịp đọc.
        </p>
        <div className="mt-4 max-w-md">
          <AppThemeControl />
        </div>
      </section>

      <section
        className="mt-4 rounded-3xl border p-5"
        style={{
          background: "var(--kd-surface)",
          borderColor: "var(--kd-border)",
        }}
      >
        <h2 className="font-extrabold">Lối tắt</h2>
        <div className="mt-4 grid gap-2 sm:flex">
          <Button
            asChild
            variant="outline"
            className="justify-center rounded-full"
          >
            <Link href="/import">Bản nháp đang chờ</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="justify-center rounded-full"
          >
            <Link href="/library?status=archived">Tác phẩm lưu trữ</Link>
          </Button>
          <Button asChild className="justify-center rounded-full">
            <Link href="/import/new">Thêm tác phẩm</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
