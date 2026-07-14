import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const supabase = await createClient();

  // You can also use getUser() which will be slower.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  return user ? (
    // min-w-0 lets this shrink inside the header's flex row instead of
    // forcing an overflow — a flex child defaults to min-width: auto,
    // which ignores the parent's available space. The greeting is hidden
    // below sm: a full email address has no room next to the brand name on
    // a phone-width header, and being logged in is already obvious from
    // seeing the Library.
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden truncate text-sm sm:inline" style={{ color: "var(--kd-text-muted)" }}>
        Xin chào, {user.email}!
      </span>
      <LogoutButton />
    </div>
  ) : (
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
