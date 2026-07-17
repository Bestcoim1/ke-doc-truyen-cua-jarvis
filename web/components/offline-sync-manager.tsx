"use client";

import { useEffect } from "react";
import {
  getPendingProgressWrites,
  prepareOfflineStorageForUser,
  removePendingProgressWrite,
} from "@/lib/offline/storage";

export function OfflineSyncManager({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (!userId) return;
    const activeUserId = userId;

    async function sync() {
      if (!navigator.onLine) return;

      try {
        await prepareOfflineStorageForUser(activeUserId);
        const pendingWrites = await getPendingProgressWrites(activeUserId);
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
              await removePendingProgressWrite(activeUserId, write.id);
            } else {
              // If it's a 4xx error (invalid data), we might want to delete it anyway to prevent infinite loops
              if (res.status >= 400 && res.status < 500) {
                console.warn(`Dropped invalid pending write ${write.id}`);
                await removePendingProgressWrite(activeUserId, write.id);
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
  }, [userId]);

  return null; // This is a logic-only component
}
