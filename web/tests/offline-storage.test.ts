import { beforeEach, describe, expect, it, vi } from "vitest";

const keyValueStore = vi.hoisted(() => new Map<IDBValidKey, unknown>());

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: IDBValidKey) => keyValueStore.get(key)),
  set: vi.fn(async (key: IDBValidKey, value: unknown) => {
    keyValueStore.set(key, value);
  }),
  del: vi.fn(async (key: IDBValidKey) => {
    keyValueStore.delete(key);
  }),
  keys: vi.fn(async () => [...keyValueStore.keys()]),
}));

import {
  clearOfflineData,
  getOfflineStory,
  prepareOfflineStorageForUser,
  saveStoryForOffline,
} from "@/lib/offline/storage";

const cachedNames = new Set([
  "pages",
  "pages-rsc",
  "static-image-assets",
]);

beforeEach(() => {
  keyValueStore.clear();
  cachedNames.clear();
  cachedNames.add("pages");
  cachedNames.add("pages-rsc");
  cachedNames.add("static-image-assets");
  vi.stubGlobal("caches", {
    delete: vi.fn(async (name: string) => cachedNames.delete(name)),
    keys: vi.fn(async () => [...cachedNames]),
  });
});

describe("offline storage account isolation", () => {
  it("stores stories in a user-specific namespace", async () => {
    await prepareOfflineStorageForUser("user-a");
    await saveStoryForOffline("user-a", {
      storyId: "story-1",
      storyTitle: "Private story",
      coverImageUrl: null,
      sections: [],
      chapters: [],
      lastSyncedAt: 1,
    });

    expect(await getOfflineStory("user-a", "story-1")).toMatchObject({
      storyTitle: "Private story",
    });
    expect(await getOfflineStory("user-b", "story-1")).toBeUndefined();
  });

  it("removes the previous account data and private caches on account switch", async () => {
    await prepareOfflineStorageForUser("user-a");
    await saveStoryForOffline("user-a", {
      storyId: "story-1",
      storyTitle: "Private story",
      coverImageUrl: null,
      sections: [],
      chapters: [],
      lastSyncedAt: 1,
    });

    await prepareOfflineStorageForUser("user-b");

    expect(await getOfflineStory("user-a", "story-1")).toBeUndefined();
    expect(cachedNames.has("pages")).toBe(false);
    expect(cachedNames.has("pages-rsc")).toBe(false);
    expect(cachedNames.has("static-image-assets")).toBe(true);
  });

  it("clears app-owned data without deleting unrelated IndexedDB entries", async () => {
    keyValueStore.set("unrelated-setting", "keep-me");
    keyValueStore.set("story:legacy", { title: "unsafe legacy data" });
    await prepareOfflineStorageForUser("user-a");

    await clearOfflineData();

    expect(keyValueStore.get("unrelated-setting")).toBe("keep-me");
    expect(keyValueStore.has("story:legacy")).toBe(false);
    expect(keyValueStore.has("offline:active-user")).toBe(false);
  });
});
