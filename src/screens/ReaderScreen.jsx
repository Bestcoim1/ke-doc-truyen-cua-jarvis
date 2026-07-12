import React from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { THEMES } from '../constants/readerSettings';
import { getFlatChapters } from '../utils/storyUtils';
import TocPanel from '../components/TocPanel';
import ReadingSettingsSheet from '../components/ReadingSettingsSheet';

export default function ReaderScreen({
  story,
  currentStoryId,
  currentChapterId,
  settings,
  scrollPct,
  contentRef,
  readMap,
  showToc,
  showSettings,
  onScroll,
  onBack,
  onPreviousChapter,
  onNextChapter,
  onOpenChapter,
  onOpenToc,
  onCloseToc,
  onOpenSettings,
  onCloseSettings,
  onUpdateSettings,
}) {
  const flatChapters = getFlatChapters(story);
  const chapterIndex = flatChapters.findIndex((chapter) => chapter.chapterId === currentChapterId);
  const entry = flatChapters[chapterIndex];
  const theme = THEMES[settings.theme];

  return (
    <div className="kd-reader" style={{ background: theme.bg }}>
      <div
        className="kd-topbar"
        style={{ background: theme.panel, borderColor: theme.border, color: theme.text }}
      >
        <button className="kd-icon-btn" onClick={onBack} aria-label="Về thư viện">
          <ArrowLeft size={19} />
        </button>
        <div className="kd-topbar-title">{story?.title}</div>
        <button className="kd-icon-btn" onClick={onOpenToc} aria-label="Mục lục">
          <List size={19} />
        </button>
        <button className="kd-aa-btn" onClick={onOpenSettings} aria-label="Tuỳ chỉnh đọc">
          Aa
        </button>
      </div>
      <div className="kd-progress-line" style={{ background: theme.border }}>
        <div className="kd-progress-fill" style={{ width: `${scrollPct}%` }} />
      </div>
      <div className="kd-content" ref={contentRef} onScroll={onScroll} style={{ color: theme.text }}>
        {entry && (
          <>
            <div className="kd-chapter-eyebrow" style={{ color: theme.meta }}>
              {entry.sectionTitle}
            </div>
            <div className="kd-chapter-title">{entry.chapterTitle}</div>
            {entry.content.split('\n\n').map((paragraph, index) => (
              <p
                className="kd-paragraph"
                key={index}
                style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}
              >
                {paragraph}
              </p>
            ))}
          </>
        )}
      </div>
      <div
        className="kd-bottombar"
        style={{ background: theme.panel, borderColor: theme.border, color: theme.text }}
      >
        <button className="kd-nav-btn" disabled={chapterIndex <= 0} onClick={onPreviousChapter}>
          <ChevronLeft size={16} /> Chương trước
        </button>
        <div className="kd-pct-label" style={{ color: theme.meta }}>
          {scrollPct}% chương này
        </div>
        <button
          className="kd-nav-btn"
          disabled={chapterIndex < 0 || chapterIndex >= flatChapters.length - 1}
          onClick={onNextChapter}
        >
          Chương sau <ChevronRight size={16} />
        </button>
      </div>

      {showToc && (
        <TocPanel
          story={story}
          currentStoryId={currentStoryId}
          currentChapterId={currentChapterId}
          readMap={readMap}
          onOpenChapter={onOpenChapter}
          onClose={onCloseToc}
        />
      )}

      {showSettings && (
        <ReadingSettingsSheet
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          onClose={onCloseSettings}
        />
      )}
    </div>
  );
}
