"use client";

import { useEffect } from "react";
import { getPendingProgressWrites, removePendingProgressWrite } from "@/lib/offline/storage";

export function OfflineSyncManager() {
  useEffect(() => {
    async function sync() {
      if (!navigator.onLine) return;

      try {
        const pendingWrites = await getPendingProgressWrites();
        if (pendingWrites.length === 0) return;

        console.log(`Syncing ${pendingWrites.length} pending progress writes...`);

        for (const write of pendingWrites) {
          try {
            const res = await fetch("/api/reader/progress", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(write.payload),
            });

            if (res.ok) {
              await removePendingProgressWrite(write.id);
            } else {
              // If it's a 4xx error (invalid data), we might want to delete it anyway to prevent infinite loops
              if (res.status >= 400 && res.status < 500) {
                console.warn(`Dropped invalid pending write ${write.id}`);
                await removePendingProgressWrite(write.id);
              }
            }
          } catch (err) {
            // Network error during sync, stop and try again later
            console.error("Failed to sync pending write, stopping sync", err);
            break;
          }
        }
      } catch (err) {
        console.error("Failed to read pending writes from IDB", err);
      }
    }

    // Try syncing immediately on mount if online
    sync();

    // Listen for coming online
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, []);

  return null; // This is a logic-only component
}
