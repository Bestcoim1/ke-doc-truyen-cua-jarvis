import { get, set, del, keys } from 'idb-keyval';
import type { ChapterRow, SectionRow } from '../reader/tree';
import type { Block } from '../reader/types';
import type { ChapterAnnotationRow } from '../reader/queries';

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

export async function saveStoryForOffline(storyData: OfflineStoryData) {
  await set(`story:${storyData.storyId}`, storyData);
}

export async function getOfflineStory(storyId: string): Promise<OfflineStoryData | undefined> {
  return get(`story:${storyId}`);
}

export async function saveChapterForOffline(storyId: string, chapterData: OfflineChapterData) {
  await set(`chapter:${storyId}:${chapterData.chapterId}`, chapterData);
}

export async function getOfflineChapter(storyId: string, chapterId: string): Promise<OfflineChapterData | undefined> {
  return get(`chapter:${storyId}:${chapterId}`);
}

export async function getOfflineStories(): Promise<OfflineStoryData[]> {
  const allKeys = await keys();
  const storyKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('story:'));
  const stories = await Promise.all(storyKeys.map(k => get(k as string)));
  return stories.filter(Boolean) as OfflineStoryData[];
}

export async function deleteOfflineStory(storyId: string) {
  await del(`story:${storyId}`);
  const allKeys = await keys();
  const chapterKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(`chapter:${storyId}:`));
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

export async function savePendingProgress(payload: any) {
  const id = crypto.randomUUID();
  const write: PendingProgressWrite = {
    id,
    payload,
    createdAt: Date.now(),
  };
  await set(`pending-progress:${id}`, write);
}

export async function getPendingProgressWrites(): Promise<PendingProgressWrite[]> {
  const allKeys = await keys();
  const progressKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('pending-progress:'));
  const writes = await Promise.all(progressKeys.map(k => get(k as string)));
  
  const validWrites = writes.filter(Boolean) as PendingProgressWrite[];
  // Sort by createdAt ascending (oldest first)
  return validWrites.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removePendingProgressWrite(id: string) {
  await del(`pending-progress:${id}`);
}
