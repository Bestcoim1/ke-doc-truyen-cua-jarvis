"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // replace (not push) so Back can't return to this entry, and refresh()
    // purges the Router Cache so any cached private RSC payload from before
    // sign-out isn't served on a subsequent Back/forward navigation.
    router.replace("/auth/login");
    router.refresh();
  };

  return <Button onClick={logout}>Đăng xuất</Button>;
}
