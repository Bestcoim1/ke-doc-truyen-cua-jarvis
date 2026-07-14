import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const supabase = await createClient();

  // Dùng getUser() thay vì getClaims() để lấy user_metadata (display_name, avatar_url)
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex gap-2">
        <Button asChild size="sm" variant={"outline"}>
          <Link href="/auth/login">Đăng nhập</Link>
        </Button>
        <Button asChild size="sm" variant={"default"}>
          <Link href="/auth/sign-up">Đăng ký</Link>
        </Button>
      </div>
    );
  }

  const displayName = user.user_metadata?.display_name || user.email;
  const avatarUrl = user.user_metadata?.avatar_url;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="h-8 w-8 rounded-full object-cover border"
          style={{ borderColor: "var(--kd-border)" }}
        />
      ) : null}
      <span
        className="hidden truncate text-sm sm:inline font-semibold"
        style={{ color: "var(--kd-text-muted)" }}
      >
        Xin chào, {displayName}!
      </span>
      <LogoutButton />
    </div>
  );
}
