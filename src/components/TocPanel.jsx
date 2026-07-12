import React from 'react';
import { ChevronRight, X } from 'lucide-react';
import SealStamp from './SealStamp';

export default function TocPanel({
  story,
  currentStoryId,
  currentChapterId,
  readMap,
  onOpenChapter,
  onClose,
}) {
  return (
    <>
      <div className="kd-overlay-backdrop" onClick={onClose} />
      <div className="kd-toc-panel">
        <div className="kd-toc-header">
          <div className="kd-toc-header-title">Mục lục</div>
          <button className="kd-icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={19} color="#241F1A" />
          </button>
        </div>
        <div className="kd-toc-body">
          {story?.sections.map((section) => (
            <div key={section.id}>
              <div className="kd-toc-section-title">{section.title}</div>
              {section.chapters.map((chapter) => {
                const isCurrent = chapter.id === currentChapterId;
                const isRead = (readMap[currentStoryId] || []).includes(chapter.id);

                return (
                  <button
                    key={chapter.id}
                    className={'kd-toc-chapter' + (isCurrent ? ' kd-current' : '')}
                    onClick={() => {
                      if (isCurrent) onClose();
                      else onOpenChapter(currentStoryId, chapter.id);
                    }}
                  >
                    {isCurrent ? (
                      <ChevronRight size={16} color="#A23B2E" />
                    ) : isRead ? (
                      <SealStamp size={15} />
                    ) : (
                      <span className="kd-toc-marker-empty" />
                    )}
                    <span className="kd-toc-chapter-title">{chapter.title}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

