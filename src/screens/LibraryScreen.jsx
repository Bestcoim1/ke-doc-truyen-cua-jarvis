import React from 'react';
import { Plus } from 'lucide-react';
import SealStamp from '../components/SealStamp';
import { getFlatChapters, metaLabel, shortLabel } from '../utils/storyUtils';

export default function LibraryScreen({ stories, progress, onOpenChapter, onAddStory }) {
  return (
    <div className="kd-library">
      <div className="kd-library-header">
        <div className="kd-app-title-row">
          <SealStamp size={20} />
          <div className="kd-app-title">Kệ Đọc</div>
        </div>
        <div className="kd-tagline">Truyện của tôi</div>
      </div>
      <div className="kd-story-list">
        {stories.map((story) => {
          const storyProgress = progress[story.id];
          const flat = getFlatChapters(story);
          let progressLabel = 'Chưa bắt đầu đọc';
          let ctaLabel = 'Bắt đầu đọc';

          if (storyProgress && storyProgress.chapterId) {
            const entry = flat.find((chapter) => chapter.chapterId === storyProgress.chapterId);
            if (entry) {
              progressLabel = `Đang đọc: ${shortLabel(entry.sectionTitle)} · ${shortLabel(entry.chapterTitle)}`;
              ctaLabel = 'Tiếp tục đọc';
            }
          }

          return (
            <div className="kd-card" key={story.id}>
              <div className="kd-card-title">{story.title}</div>
              {story.author && <div className="kd-card-author">{story.author}</div>}
              <div className="kd-card-meta">{metaLabel(story)}</div>
              <div className="kd-card-progress">{progressLabel}</div>
              <button
                className="kd-card-cta"
                onClick={() => {
                  if (storyProgress && storyProgress.chapterId) {
                    onOpenChapter(story.id, storyProgress.chapterId, { resume: true });
                  } else if (flat[0]) {
                    onOpenChapter(story.id, flat[0].chapterId);
                  }
                }}
              >
                <SealStamp size={12} /> {ctaLabel}
              </button>
            </div>
          );
        })}
        <button className="kd-add-card" onClick={onAddStory}>
          <Plus size={16} /> Thêm truyện mới
        </button>
      </div>
    </div>
  );
}

