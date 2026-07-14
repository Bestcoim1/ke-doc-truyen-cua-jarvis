"use server";

import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/telemetry";
import type { ReadingSettings } from "./types";

// Progress and chapter-state writes moved to /api/reader/progress so the
// client can use keepalive fetch — Server Action POSTs get aborted when a
// flush coincides with navigation/pagehide (see that route's docblock).
// Settings updates only happen while the page is alive, so a Server
// Action remains the simplest correct tool here.

export async function updateReadingSettings(patch: Partial<ReadingSettings>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return;

  const current = await supabase
    .from("reading_settings")
    .select("font_size_step, line_height, theme")
    .eq("user_id", userId)
    .maybeSingle();
  if (current.error) {
    logEvent("reader.settings_current_query_error", {
      code: current.error.code,
    });
  }

  const next = {
    user_id: userId,
    font_size_step: patch.fontSizeStep ?? current.data?.font_size_step ?? 1,
    line_height: patch.lineHeight ?? current.data?.line_height ?? 1.7,
    theme: patch.theme ?? current.data?.theme ?? "light",
  };

  const { error } = await supabase.from("reading_settings").upsert(next);
  if (error) {
    logEvent("reader.settings_save_error", { code: error.code });
  }
}
