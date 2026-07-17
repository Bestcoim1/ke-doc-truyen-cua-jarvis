/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope &
  typeof globalThis & {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  };

// The default Next.js cache includes HTML, RSC payloads and API responses.
// Those are account-specific and must never survive a logout or be
// shared with another account on the same browser. Keep only asset caches;
// offline manuscript content is stored separately in user-scoped IndexedDB.
const privateRuntimeCacheNames = new Set([
  "next-data",
  "apis",
  "pages-rsc-prefetch",
  "pages-rsc",
  "pages",
  "others",
  "cross-origin",
]);

const safeRuntimeCaching = defaultCache.filter(({ handler }) => {
  if (typeof handler !== "object" || handler === null || !("cacheName" in handler)) {
    return true;
  }
  const cacheName = (handler as { cacheName?: string }).cacheName;
  return !cacheName || !privateRuntimeCacheNames.has(cacheName);
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: safeRuntimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
