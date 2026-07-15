"use client";

import { useEffect, useState } from "react";
import { getOfflineChapter, getOfflineStory, type OfflineChapterData, type OfflineStoryData } from "@/lib/offline/storage";
import { BlockRenderer } from "@/components/reader/block-renderer";

export default function OfflineFallbackPage() {
  const [offlineData, setOfflineData] = useState<{
    story: OfflineStoryData;
    chapter: OfflineChapterData;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOfflineContent() {
      const path = window.location.pathname;
      const match = path.match(/^\/read\/([^/]+)\/([^/]+)/);
      if (!match) {
        setError("You are offline. Connect to the internet to use this app.");
        return;
      }

      const [, storyId, chapterId] = match;
      try {
        const [story, chapter] = await Promise.all([
          getOfflineStory(storyId),
          getOfflineChapter(storyId, chapterId),
        ]);

        if (story && chapter) {
          setOfflineData({ story, chapter });
        } else {
          setError("This chapter is not available offline.");
        }
      } catch (e) {
        setError("Error loading offline content.");
      }
    }

    loadOfflineContent();
  }, []);

  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Offline</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!offlineData) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <p>Loading offline content...</p>
      </div>
    );
  }

  const { story, chapter } = offlineData;

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[var(--kd-bg)] text-[var(--kd-text)]">
      <header
        className="flex items-center justify-between border-b px-3 py-3"
        style={{ borderColor: "var(--kd-border)", background: "var(--kd-surface)" }}
      >
        <div className="flex flex-col">
          <span className="truncate text-sm font-semibold">{story.storyTitle}</span>
          <span className="text-xs text-muted-foreground">OFFLINE MODE</span>
        </div>
      </header>
      <div className="relative z-10 flex-1 overflow-y-auto px-5 py-5 font-serif"
        style={{
          fontSize: "1.265rem",
          lineHeight: 1.7,
        }}>
        <div className="mx-auto w-full max-w-2xl text-justify">
          <BlockRenderer blocks={chapter.blocks} annotations={chapter.annotations} />
        </div>
      </div>
    </div>
  );
}
