"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { clearOfflineData } from "@/lib/offline/storage";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    await clearOfflineData();
    // replace (not push) so Back can't return to this entry, and refresh()
    // purges the Router Cache so any cached private RSC payload from before
    // sign-out isn't served on a subsequent Back/forward navigation.
    router.replace("/auth/login");
    router.refresh();
  };

  return (
    <Button size="sm" onClick={logout}>
      Đăng xuất
    </Button>
  );
}
