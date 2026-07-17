import { get, set, del, keys } from "idb-keyval";
import type { ChapterRow, SectionRow } from '../reader/tree';
import type { Block } from '../reader/types';
import type { ChapterAnnotationRow } from '../reader/queries';

const ACTIVE_USER_KEY = "offline:active-user";
const USER_KEY_PREFIX = "offline:user:";
const LEGACY_KEY_PREFIXES = ["story:", "chapter:", "pending-progress:"];
const PRIVATE_RUNTIME_CACHE_NAMES = [
  "next-data",
  "apis",
  "pages-rsc-prefetch",
  "pages-rsc",
  "pages",
  "others",
  "cross-origin",
];

function userKey(userId: string, suffix: string) {
  return `${USER_KEY_PREFIX}${userId}:${suffix}`;
}

function isManagedOfflineKey(key: IDBValidKey): boolean {
  return (
    key === ACTIVE_USER_KEY ||
    (typeof key === "string" &&
      (key.startsWith(USER_KEY_PREFIX) ||
        LEGACY_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))))
  );
}

async function deleteKeys(matcher: (key: IDBValidKey) => boolean) {
  const allKeys = await keys();
  await Promise.all(allKeys.filter(matcher).map((key) => del(key)));
}

export async function purgePrivateRuntimeCaches() {
  if (typeof caches === "undefined") return;
  await Promise.all(
    PRIVATE_RUNTIME_CACHE_NAMES.map((cacheName) => caches.delete(cacheName)),
  );
}

/**
 * Establishes the account namespace before any offline read/write. Legacy
 * unscoped data is removed once because its owner cannot be established
 * safely. Switching accounts clears all app-owned offline data and caches.
 */
export async function prepareOfflineStorageForUser(userId: string) {
  const previousUserId = await get<string>(ACTIVE_USER_KEY);
  if (previousUserId && previousUserId !== userId) {
    await clearOfflineData();
  } else {
    await deleteKeys(
      (key) =>
        typeof key === "string" &&
        LEGACY_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
    await purgePrivateRuntimeCaches();
  }
  await set(ACTIVE_USER_KEY, userId);
}

export async function getActiveOfflineUserId(): Promise<string | undefined> {
  return get<string>(ACTIVE_USER_KEY);
}

export async function clearOfflineData() {
  await deleteKeys(isManagedOfflineKey);
  await purgePrivateRuntimeCaches();
}

export type OfflineStoryData = {
  storyId: string;
  storyTitle: string;
  coverImageUrl: string | null;
  sections: SectionRow[];
  chapters: ChapterRow[];
  lastSyncedAt: number;
};

export type OfflineChapterData = {
  chapterId: string;
  revisionId: string;
  contentHash: string;
  blocks: Block[];
  annotations: ChapterAnnotationRow[];
};

export async function saveStoryForOffline(
  userId: string,
  storyData: OfflineStoryData,
) {
  await set(userKey(userId, `story:${storyData.storyId}`), storyData);
}

export async function getOfflineStory(
  userId: string,
  storyId: string,
): Promise<OfflineStoryData | undefined> {
  return get(userKey(userId, `story:${storyId}`));
}

export async function saveChapterForOffline(
  userId: string,
  storyId: string,
  chapterData: OfflineChapterData,
) {
  await set(
    userKey(userId, `chapter:${storyId}:${chapterData.chapterId}`),
    chapterData,
  );
}

export async function getOfflineChapter(
  userId: string,
  storyId: string,
  chapterId: string,
): Promise<OfflineChapterData | undefined> {
  return get(userKey(userId, `chapter:${storyId}:${chapterId}`));
}

export async function getOfflineStories(userId: string): Promise<OfflineStoryData[]> {
  const allKeys = await keys();
  const storyPrefix = userKey(userId, "story:");
  const storyKeys = allKeys.filter(
    (key) => typeof key === "string" && key.startsWith(storyPrefix),
  );
  const stories = await Promise.all(storyKeys.map(k => get(k as string)));
  return stories.filter(Boolean) as OfflineStoryData[];
}

export async function deleteOfflineStory(userId: string, storyId: string) {
  await del(userKey(userId, `story:${storyId}`));
  const allKeys = await keys();
  const chapterPrefix = userKey(userId, `chapter:${storyId}:`);
  const chapterKeys = allKeys.filter(
    (key) => typeof key === "string" && key.startsWith(chapterPrefix),
  );
  await Promise.all(chapterKeys.map(k => del(k as string)));
}

// --- Pending Progress Sync ---

export type PendingProgressWrite = {
  id: string; // random UUID for tracking
  payload: {
    progress?: Record<string, unknown>;
    chapterState?: Record<string, unknown>;
  };
  createdAt: number;
};

export async function savePendingProgress(
  userId: string,
  payload: PendingProgressWrite["payload"],
) {
  const id = crypto.randomUUID();
  const write: PendingProgressWrite = {
    id,
    payload,
    createdAt: Date.now(),
  };
  await set(userKey(userId, `pending-progress:${id}`), write);
}

export async function getPendingProgressWrites(
  userId: string,
): Promise<PendingProgressWrite[]> {
  const allKeys = await keys();
  const progressPrefix = userKey(userId, "pending-progress:");
  const progressKeys = allKeys.filter(
    (key) => typeof key === "string" && key.startsWith(progressPrefix),
  );
  const writes = await Promise.all(progressKeys.map(k => get(k as string)));
  
  const validWrites = writes.filter(Boolean) as PendingProgressWrite[];
  // Sort by createdAt ascending (oldest first)
  return validWrites.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removePendingProgressWrite(userId: string, id: string) {
  await del(userKey(userId, `pending-progress:${id}`));
}
