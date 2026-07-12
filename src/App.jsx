import React, { useEffect, useRef, useState } from 'react';
import { seedProgress, seedReadMap, seedStories } from './data/seedStories';
import { getFlatChapters } from './utils/storyUtils';
import { persist, readStoredJson } from './utils/storage';
import { buildImportedStory } from './utils/textImportParser';
import LibraryScreen from './screens/LibraryScreen';
import ReaderScreen from './screens/ReaderScreen';
import AddStoryScreen from './screens/AddStoryScreen';
import AddMethodScreen from './screens/AddMethodScreen';
import ImportTextScreen from './screens/ImportTextScreen';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Noto+Serif:wght@400;500;600&display=swap');

.kd-outer, .kd-outer *, .kd-outer *::before, .kd-outer *::after { box-sizing: border-box; }

.kd-outer {
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
  background: radial-gradient(circle at 30% 20%, #E6DDC9, #D6CBB0 70%);
  font-family: 'Be Vietnam Pro', sans-serif;
}

.kd-phone {
  position: relative;
  width: min(430px, 100%);
  height: min(800px, 94vh);
  background: #F7F1E4;
  border-radius: 32px;
  box-shadow: 0 30px 60px -20px rgba(40,30,15,0.45), 0 0 0 1px rgba(40,30,15,0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.kd-phone button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; }
.kd-phone input, .kd-phone textarea { font-family: inherit; }
.kd-phone :focus-visible { outline: 2px solid #A23B2E; outline-offset: 2px; border-radius: 4px; }

.kd-loading { flex: 1; display: flex; align-items: center; justify-content: center; color: #8B7E6A; font-size: 13px; }

/* Library */
.kd-library { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.kd-library-header { padding: 28px 20px 16px; }
.kd-app-title-row { display: flex; align-items: center; gap: 8px; }
.kd-app-title { font-weight: 800; font-size: 26px; color: #241F1A; letter-spacing: -0.01em; }
.kd-tagline { font-size: 13px; color: #8B7E6A; margin-top: 2px; }
.kd-story-list { flex: 1; overflow-y: auto; padding: 4px 20px 28px; display: flex; flex-direction: column; gap: 14px; }
.kd-card { background: #FFFDF8; border: 1px solid rgba(140,120,90,0.18); border-radius: 18px; padding: 16px 18px; }
.kd-card-title { font-weight: 700; font-size: 17px; color: #241F1A; }
.kd-card-author { font-size: 12px; color: #9C8362; margin-top: 2px; }
.kd-card-meta { font-size: 12.5px; color: #8B7E6A; margin-top: 8px; }
.kd-card-progress { font-size: 12.5px; color: #6B5A46; margin-top: 2px; }
.kd-card-cta { margin-top: 12px; display: inline-flex; align-items: center; gap: 6px; background: #A23B2E; color: #FDF8ED; font-weight: 700; font-size: 13.5px; padding: 9px 16px; border-radius: 100px; }
.kd-add-card { border: 1.5px dashed rgba(140,120,90,0.4); border-radius: 18px; padding: 18px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #8B7E6A; font-weight: 600; font-size: 14px; }

/* Reader */
.kd-reader { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.kd-topbar { display: flex; align-items: center; gap: 10px; padding: 14px 14px; border-bottom: 1px solid; flex-shrink: 0; }
.kd-topbar-title { flex: 1; font-weight: 700; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kd-icon-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 10px; flex-shrink: 0; }
.kd-aa-btn { font-weight: 800; font-size: 15px; width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kd-progress-line { height: 3px; width: 100%; flex-shrink: 0; }
.kd-progress-fill { height: 100%; background: #A23B2E; transition: width 0.2s ease; }
.kd-content { flex: 1; overflow-y: auto; padding: 22px 22px 40px; font-family: 'Noto Serif', serif; }
.kd-chapter-eyebrow { font-family: 'Be Vietnam Pro', sans-serif; font-size: 12.5px; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.65; margin-bottom: 6px; }
.kd-chapter-title { font-family: 'Be Vietnam Pro', sans-serif; font-weight: 700; font-size: 20px; margin-bottom: 18px; line-height: 1.35; }
.kd-paragraph { margin: 0 0 1.1em; white-space: pre-line; }
.kd-bottombar { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-top: 1px solid; gap: 8px; flex-shrink: 0; }
.kd-nav-btn { display: flex; align-items: center; gap: 4px; font-family: 'Be Vietnam Pro', sans-serif; font-weight: 600; font-size: 13px; padding: 9px 12px; border-radius: 10px; }
.kd-nav-btn:disabled { opacity: 0.3; cursor: default; }
.kd-pct-label { font-family: 'Be Vietnam Pro', sans-serif; font-size: 12px; opacity: 0.7; font-weight: 600; white-space: nowrap; }

/* Overlays */
.kd-overlay-backdrop { position: absolute; inset: 0; background: rgba(20,15,10,0.45); z-index: 20; }
.kd-toc-panel { position: absolute; top: 0; right: 0; bottom: 0; width: 82%; max-width: 340px; background: #FFFDF8; z-index: 21; display: flex; flex-direction: column; box-shadow: -12px 0 30px rgba(0,0,0,0.15); }
.kd-toc-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 18px 12px; border-bottom: 1px solid rgba(0,0,0,0.06); flex-shrink: 0; }
.kd-toc-header-title { font-weight: 800; font-size: 16px; color: #241F1A; }
.kd-toc-body { flex: 1; overflow-y: auto; padding: 10px 6px 20px; }
.kd-toc-section-title { font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #9C8362; padding: 14px 16px 6px; }
.kd-toc-chapter { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 16px; text-align: left; border-radius: 10px; }
.kd-toc-chapter-title { font-size: 13.5px; color: #3A332B; flex: 1; }
.kd-toc-chapter.kd-current { background: rgba(162,59,46,0.08); }
.kd-toc-chapter.kd-current .kd-toc-chapter-title { color: #A23B2E; font-weight: 700; }
.kd-toc-marker-empty { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid rgba(140,120,90,0.4); flex-shrink: 0; }

.kd-settings-sheet { position: absolute; left: 0; right: 0; bottom: 0; background: #FFFDF8; z-index: 21; border-radius: 22px 22px 0 0; box-shadow: 0 -12px 30px rgba(0,0,0,0.15); padding: 8px 20px 26px; }
.kd-sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: rgba(0,0,0,0.15); margin: 8px auto 14px; }
.kd-sheet-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.kd-sheet-title { font-weight: 800; font-size: 16px; color: #241F1A; }
.kd-settings-row { margin-bottom: 18px; }
.kd-settings-label { font-size: 12.5px; font-weight: 700; color: #8B7E6A; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
.kd-pill-group { display: flex; gap: 8px; flex-wrap: wrap; }
.kd-pill { padding: 9px 14px; border-radius: 100px; font-size: 13.5px; font-weight: 600; background: rgba(140,120,90,0.1); color: #5C5040; display: flex; align-items: center; gap: 6px; }
.kd-pill.kd-pill-active { background: #A23B2E; color: #FDF8ED; }
.kd-theme-swatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.15); display: inline-block; }

@media (prefers-reduced-motion: no-preference) {
  .kd-toc-panel { animation: kd-slide-in 0.28s ease; }
  .kd-settings-sheet { animation: kd-sheet-up 0.28s ease; }
  .kd-overlay-backdrop { animation: kd-fade-in 0.2s ease; }
}
@keyframes kd-slide-in { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes kd-sheet-up { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes kd-fade-in { from { opacity: 0; } to { opacity: 1; } }

/* Add story */
.kd-add-screen { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.kd-add-header { display: flex; align-items: center; gap: 10px; padding: 16px 16px 8px; flex-shrink: 0; }
.kd-add-title { font-weight: 800; font-size: 17px; color: #241F1A; }
.kd-add-body { flex: 1; overflow-y: auto; padding: 8px 20px 28px; }
.kd-field-label { font-size: 12.5px; font-weight: 700; color: #8B7E6A; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: 0.03em; }
.kd-input, .kd-textarea { width: 100%; border: 1.5px solid rgba(140,120,90,0.25); border-radius: 12px; padding: 11px 13px; font-size: 14.5px; color: #241F1A; background: #FFFDF8; }
.kd-textarea { min-height: 140px; resize: vertical; line-height: 1.6; font-family: 'Noto Serif', serif; }
.kd-btn-primary { width: 100%; background: #A23B2E; color: #FDF8ED; font-weight: 700; font-size: 14.5px; padding: 13px; border-radius: 14px; margin-top: 18px; display: flex; align-items: center; justify-content: center; gap: 6px; }
.kd-btn-primary:disabled { opacity: 0.4; cursor: default; }
.kd-btn-secondary { width: 100%; background: rgba(140,120,90,0.1); color: #5C5040; font-weight: 700; font-size: 14.5px; padding: 13px; border-radius: 14px; margin-top: 10px; }
.kd-added-list { margin-top: 22px; }
.kd-added-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #FFFDF8; border: 1px solid rgba(140,120,90,0.15); border-radius: 12px; margin-bottom: 8px; }
.kd-added-item-text { flex: 1; font-size: 13px; }
.kd-added-item-section { font-size: 11px; color: #9C8362; }
.kd-added-item-title { font-weight: 600; color: #241F1A; }
.kd-remove-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #A23B2E; flex-shrink: 0; }

/* Add method */
.kd-method-intro { font-size: 13.5px; color: #8B7E6A; margin: 8px 0 16px; }
.kd-method-list { display: flex; flex-direction: column; gap: 10px; }
.kd-method-card { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px; text-align: left; background: #FFFDF8 !important; border: 1px solid rgba(140,120,90,0.18) !important; border-radius: 14px; }
.kd-method-card:hover:not(:disabled) { border-color: rgba(162,59,46,0.35) !important; }
.kd-method-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: rgba(162,59,46,0.09); color: #A23B2E; flex-shrink: 0; }
.kd-method-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.kd-method-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kd-method-title { font-size: 14px; font-weight: 700; color: #241F1A; }
.kd-method-description { font-size: 12px; line-height: 1.45; color: #8B7E6A; }
.kd-method-disabled { opacity: 0.58; cursor: default !important; }
.kd-coming-soon { padding: 3px 7px; border-radius: 100px; background: rgba(140,120,90,0.12); color: #8B7E6A; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }

/* Text import */
.kd-import-textarea { min-height: 260px; }
.kd-phone .kd-import-action-primary { background: #A23B2E; color: #FDF8ED; }
.kd-phone .kd-import-action-secondary { background: rgba(140,120,90,0.1); color: #5C5040; }
.kd-import-error { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: rgba(162,59,46,0.08); color: #8B2F25; font-size: 12.5px; line-height: 1.5; }
.kd-import-hint { margin-top: 8px; color: #8B7E6A; font-size: 12px; text-align: center; }
.kd-preview-heading { padding: 8px 0 2px; }
.kd-preview-eyebrow { color: #9C8362; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.kd-preview-story-title { margin-top: 4px; color: #241F1A; font-size: 18px; font-weight: 800; line-height: 1.35; }
.kd-preview-author { margin-top: 2px; color: #8B7E6A; font-size: 12.5px; }
.kd-import-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 16px 0; }
.kd-summary-item { display: flex; align-items: center; gap: 8px; padding: 11px 12px; border-radius: 12px; background: rgba(140,120,90,0.09); color: #6B5A46; font-size: 12.5px; }
.kd-summary-item svg { color: #A23B2E; flex-shrink: 0; }
.kd-summary-item strong { color: #241F1A; font-size: 15px; }
.kd-import-warnings { margin: 0 0 14px; padding: 10px 12px; border-radius: 12px; background: rgba(181,122,34,0.1); color: #715322; font-size: 12px; line-height: 1.5; }
.kd-import-warnings-title { display: flex; align-items: center; gap: 6px; font-weight: 700; }
.kd-import-warnings ul { margin: 6px 0 0; padding-left: 18px; }
.kd-preview-tree { display: flex; flex-direction: column; gap: 12px; }
.kd-preview-section { overflow: hidden; border: 1px solid rgba(140,120,90,0.16); border-radius: 12px; background: #FFFDF8; }
.kd-preview-section-title { padding: 10px 12px; background: rgba(140,120,90,0.07); color: #6B5A46; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.kd-preview-chapters { padding: 4px 0; }
.kd-preview-chapter { display: flex; align-items: center; gap: 6px; padding: 8px 12px; color: #3A332B; font-size: 13px; line-height: 1.4; }
.kd-preview-chapter svg { color: #A23B2E; flex-shrink: 0; }
`;

export default function App() {
  const [ready, setReady] = useState(false);
  const [stories, setStories] = useState([]);
  const [settings, setSettings] = useState({ fontSize: 18, lineHeight: 1.7, theme: 'light' });
  const [progress, setProgress] = useState({});
  const [readMap, setReadMap] = useState({});

  const [screen, setScreen] = useState('library');
  const [currentStoryId, setCurrentStoryId] = useState(null);
  const [currentChapterId, setCurrentChapterId] = useState(null);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);

  const [newStoryTitle, setNewStoryTitle] = useState('');
  const [newStoryAuthor, setNewStoryAuthor] = useState('');
  const [activeAddStoryId, setActiveAddStoryId] = useState(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterContent, setNewChapterContent] = useState('');
  const [lastAddedChapterId, setLastAddedChapterId] = useState(null);

  const contentRef = useRef(null);
  const saveTimer = useRef(null);
  const pendingScrollRestore = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedStories = await readStoredJson('stories');
      const storedSettings = await readStoredJson('reading-settings');
      const storedProgress = await readStoredJson('reading-progress');
      const storedReadMap = await readStoredJson('read-chapters');

      if (cancelled) return;

      const finalStories = storedStories || seedStories;
      const finalProgress = storedProgress || seedProgress;
      const finalReadMap = storedReadMap || seedReadMap;

      setStories(finalStories);
      if (storedSettings) setSettings(storedSettings);
      setProgress(finalProgress);
      setReadMap(finalReadMap);
      setReady(true);

      if (!storedStories) await persist('stories', finalStories);
      if (!storedProgress) await persist('reading-progress', finalProgress);
      if (!storedReadMap) await persist('read-chapters', finalReadMap);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (screen === 'reader' && contentRef.current) {
      const element = contentRef.current;
      const animationFrame = requestAnimationFrame(() => {
        const max = element.scrollHeight - element.clientHeight;
        const percentage = pendingScrollRestore.current || 0;
        element.scrollTop = max > 0 ? (percentage / 100) * max : 0;
      });
      return () => cancelAnimationFrame(animationFrame);
    }
  }, [currentChapterId, screen]);

  function updateSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    persist('reading-settings', next);
  }

  function openChapter(storyId, chapterId, options = {}) {
    const story = stories.find((candidate) => candidate.id === storyId);
    if (!story) return;

    const flat = getFlatChapters(story);
    const target = flat.find((chapter) => chapter.chapterId === chapterId);
    if (!target) return;

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    const resume = Boolean(options.resume) && progress[storyId]?.chapterId === chapterId;
    const startPct = resume ? progress[storyId]?.scrollPct || 0 : 0;

    pendingScrollRestore.current = startPct;
    setCurrentStoryId(storyId);
    setCurrentChapterId(chapterId);
    setScrollPct(startPct);
    setScreen('reader');
    setShowToc(false);
    setShowSettings(false);

    const nextProgress = {
      ...progress,
      [storyId]: { sectionId: target.sectionId, chapterId, scrollPct: startPct },
    };
    setProgress(nextProgress);
    persist('reading-progress', nextProgress);
  }

  function handleScroll() {
    const element = contentRef.current;
    if (!element) return;

    const max = element.scrollHeight - element.clientHeight;
    const percentage =
      max <= 0
        ? 100
        : Math.min(100, Math.max(0, Math.round((element.scrollTop / max) * 100)));
    setScrollPct(percentage);

    if (saveTimer.current) clearTimeout(saveTimer.current);

    const storyId = currentStoryId;
    const chapterId = currentChapterId;
    const story = stories.find((candidate) => candidate.id === storyId);
    const flat = getFlatChapters(story);
    const entry = flat.find((chapter) => chapter.chapterId === chapterId);

    saveTimer.current = setTimeout(() => {
      setProgress((previous) => {
        const next = {
          ...previous,
          [storyId]: {
            sectionId: entry?.sectionId,
            chapterId,
            scrollPct: percentage,
          },
        };
        persist('reading-progress', next);
        return next;
      });

      if (percentage >= 90) {
        setReadMap((previous) => {
          const alreadyRead = previous[storyId] || [];
          if (alreadyRead.includes(chapterId)) return previous;
          const next = { ...previous, [storyId]: [...alreadyRead, chapterId] };
          persist('read-chapters', next);
          return next;
        });
      }
    }, 500);
  }

  function goPreviousChapter() {
    const story = stories.find((candidate) => candidate.id === currentStoryId);
    const flat = getFlatChapters(story);
    const index = flat.findIndex((chapter) => chapter.chapterId === currentChapterId);
    if (index > 0) openChapter(currentStoryId, flat[index - 1].chapterId);
  }

  function goNextChapter() {
    const story = stories.find((candidate) => candidate.id === currentStoryId);
    const flat = getFlatChapters(story);
    const index = flat.findIndex((chapter) => chapter.chapterId === currentChapterId);
    if (index >= 0 && index < flat.length - 1) {
      openChapter(currentStoryId, flat[index + 1].chapterId);
    }
  }

  function openAddStory() {
    setNewStoryTitle('');
    setNewStoryAuthor('');
    setActiveAddStoryId(null);
    setNewSectionTitle('');
    setNewChapterTitle('');
    setNewChapterContent('');
    setLastAddedChapterId(null);
    setScreen('addStory');
  }

  function saveImportedStory(importedStory) {
    const story = buildImportedStory(importedStory);
    const next = [...stories, story];
    setStories(next);
    persist('stories', next);
    setScreen('library');
  }

  function createStory() {
    const title = newStoryTitle.trim();
    if (!title) return;

    const id = 'story' + Date.now() + Math.floor(Math.random() * 1000);
    const story = { id, title, author: newStoryAuthor.trim() || null, sections: [] };
    const next = [...stories, story];
    setStories(next);
    persist('stories', next);
    setActiveAddStoryId(id);
  }

  function addChapter() {
    if (!activeAddStoryId) return;

    const chapterTitle = newChapterTitle.trim();
    if (!chapterTitle) return;

    const sectionTitle = newSectionTitle.trim() || 'Chương lẻ';
    const content =
      newChapterContent.trim() || 'Chưa có nội dung — cậu có thể dán truyện thật vào đây.';
    const chapterId = 'ch' + Date.now() + Math.floor(Math.random() * 1000);
    const newChapter = { id: chapterId, title: chapterTitle, content };

    const next = stories.map((story) => {
      if (story.id !== activeAddStoryId) return story;

      const existingSection = story.sections.find(
        (section) => section.title.trim().toLowerCase() === sectionTitle.toLowerCase(),
      );
      let sections;

      if (existingSection) {
        sections = story.sections.map((section) =>
          section.id === existingSection.id
            ? { ...section, chapters: [...section.chapters, newChapter] }
            : section,
        );
      } else {
        const sectionId = 'sec' + Date.now() + Math.floor(Math.random() * 1000);
        sections = [
          ...story.sections,
          { id: sectionId, title: sectionTitle, chapters: [newChapter] },
        ];
      }

      return { ...story, sections };
    });

    setStories(next);
    persist('stories', next);
    setLastAddedChapterId(chapterId);
    setNewChapterTitle('');
    setNewChapterContent('');
  }

  function removeChapter(sectionId, chapterId) {
    const next = stories.map((story) => {
      if (story.id !== activeAddStoryId) return story;

      const sections = story.sections
        .map((section) =>
          section.id === sectionId
            ? {
                ...section,
                chapters: section.chapters.filter((chapter) => chapter.id !== chapterId),
              }
            : section,
        )
        .filter((section) => section.chapters.length > 0);

      return { ...story, sections };
    });

    setStories(next);
    persist('stories', next);
    if (lastAddedChapterId === chapterId) setLastAddedChapterId(null);
  }

  function finishAdding() {
    setScreen('library');
    setActiveAddStoryId(null);
    setNewStoryTitle('');
    setNewStoryAuthor('');
    setNewSectionTitle('');
    setNewChapterTitle('');
    setNewChapterContent('');
    setLastAddedChapterId(null);
  }

  function readNowFromAdd() {
    if (activeAddStoryId && lastAddedChapterId) {
      openChapter(activeAddStoryId, lastAddedChapterId);
    }
  }

  const activeStory = stories.find((story) => story.id === activeAddStoryId);
  const existingSectionTitles = activeStory
    ? activeStory.sections.map((section) => section.title)
    : [];
  const readerStory = stories.find((story) => story.id === currentStoryId);

  return (
    <div className="kd-outer">
      <style>{CSS}</style>
      <div className="kd-phone">
        {!ready ? (
          <div className="kd-loading">Đang mở kệ đọc...</div>
        ) : screen === 'library' ? (
          <LibraryScreen
            stories={stories}
            progress={progress}
            onOpenChapter={openChapter}
            onAddStory={() => setScreen('addMethod')}
          />
        ) : screen === 'reader' ? (
          <ReaderScreen
            story={readerStory}
            currentStoryId={currentStoryId}
            currentChapterId={currentChapterId}
            settings={settings}
            scrollPct={scrollPct}
            contentRef={contentRef}
            readMap={readMap}
            showToc={showToc}
            showSettings={showSettings}
            onScroll={handleScroll}
            onBack={() => setScreen('library')}
            onPreviousChapter={goPreviousChapter}
            onNextChapter={goNextChapter}
            onOpenChapter={openChapter}
            onOpenToc={() => setShowToc(true)}
            onCloseToc={() => setShowToc(false)}
            onOpenSettings={() => setShowSettings(true)}
            onCloseSettings={() => setShowSettings(false)}
            onUpdateSettings={updateSettings}
          />
        ) : screen === 'addMethod' ? (
          <AddMethodScreen
            onBack={() => setScreen('library')}
            onManual={openAddStory}
            onImportText={() => setScreen('importText')}
          />
        ) : screen === 'importText' ? (
          <ImportTextScreen
            onBack={() => setScreen('addMethod')}
            onSave={saveImportedStory}
          />
        ) : (
          <AddStoryScreen
            activeStory={activeStory}
            activeAddStoryId={activeAddStoryId}
            existingSectionTitles={existingSectionTitles}
            newStoryTitle={newStoryTitle}
            newStoryAuthor={newStoryAuthor}
            newSectionTitle={newSectionTitle}
            newChapterTitle={newChapterTitle}
            newChapterContent={newChapterContent}
            lastAddedChapterId={lastAddedChapterId}
            onChangeStoryTitle={setNewStoryTitle}
            onChangeStoryAuthor={setNewStoryAuthor}
            onChangeSectionTitle={setNewSectionTitle}
            onChangeChapterTitle={setNewChapterTitle}
            onChangeChapterContent={setNewChapterContent}
            onBack={() => (activeAddStoryId ? finishAdding() : setScreen('addMethod'))}
            onCreateStory={createStory}
            onAddChapter={addChapter}
            onRemoveChapter={removeChapter}
            onReadNow={readNowFromAdd}
            onFinish={finishAdding}
          />
        )}
      </div>
    </div>
  );
}
