import React from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { totalChapters } from '../utils/storyUtils';

export default function AddStoryScreen({
  activeStory,
  activeAddStoryId,
  existingSectionTitles,
  newStoryTitle,
  newStoryAuthor,
  newSectionTitle,
  newChapterTitle,
  newChapterContent,
  lastAddedChapterId,
  onChangeStoryTitle,
  onChangeStoryAuthor,
  onChangeSectionTitle,
  onChangeChapterTitle,
  onChangeChapterContent,
  onBack,
  onCreateStory,
  onAddChapter,
  onRemoveChapter,
  onReadNow,
  onFinish,
}) {
  return (
    <div className="kd-add-screen">
      <div className="kd-add-header">
        <button className="kd-icon-btn" onClick={onBack} aria-label="Quay lại">
          <ArrowLeft size={20} color="#241F1A" />
        </button>
        <div className="kd-add-title">{activeAddStoryId ? 'Thêm chương' : 'Truyện mới'}</div>
      </div>
      <div className="kd-add-body">
        {!activeAddStoryId ? (
          <>
            <div className="kd-field-label">Tên truyện</div>
            <input
              className="kd-input"
              value={newStoryTitle}
              onChange={(event) => onChangeStoryTitle(event.target.value)}
              placeholder="Ví dụ: Những Buổi Tối Không Tên"
            />
            <div className="kd-field-label">Tác giả / dịch giả (không bắt buộc)</div>
            <input
              className="kd-input"
              value={newStoryAuthor}
              onChange={(event) => onChangeStoryAuthor(event.target.value)}
              placeholder="Để trống nếu không cần"
            />
            <button
              className="kd-btn-primary"
              disabled={!newStoryTitle.trim()}
              onClick={onCreateStory}
            >
              <Plus size={16} /> Tạo truyện, thêm chương
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: '13px', color: '#8B7E6A', marginBottom: '4px' }}>
              Đang thêm chương cho
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: '16px',
                color: '#241F1A',
                marginBottom: '6px',
              }}
            >
              {activeStory?.title}
            </div>

            <div className="kd-field-label">Thuộc hồi / phần</div>
            <input
              className="kd-input"
              list="kd-section-list"
              value={newSectionTitle}
              onChange={(event) => onChangeSectionTitle(event.target.value)}
              placeholder="Ví dụ: Hồi 1: Khởi Đầu"
            />
            <datalist id="kd-section-list">
              {existingSectionTitles.map((title) => (
                <option key={title} value={title} />
              ))}
            </datalist>

            <div className="kd-field-label">Tên chương</div>
            <input
              className="kd-input"
              value={newChapterTitle}
              onChange={(event) => onChangeChapterTitle(event.target.value)}
              placeholder="Ví dụ: Chương 1: Ngày Đầu Tiên"
            />

            <div className="kd-field-label">Nội dung</div>
            <textarea
              className="kd-textarea"
              value={newChapterContent}
              onChange={(event) => onChangeChapterContent(event.target.value)}
              placeholder="Dán nội dung chương vào đây..."
            />

            <button
              className="kd-btn-primary"
              disabled={!newChapterTitle.trim()}
              onClick={onAddChapter}
            >
              <Plus size={16} /> Lưu chương
            </button>

            {activeStory && totalChapters(activeStory) > 0 && (
              <div className="kd-added-list">
                <div className="kd-field-label">Đã thêm ({totalChapters(activeStory)})</div>
                {activeStory.sections.map((section) =>
                  section.chapters.map((chapter) => (
                    <div className="kd-added-item" key={chapter.id}>
                      <div className="kd-added-item-text">
                        <div className="kd-added-item-section">{section.title}</div>
                        <div className="kd-added-item-title">{chapter.title}</div>
                      </div>
                      <button
                        className="kd-remove-btn"
                        onClick={() => onRemoveChapter(section.id, chapter.id)}
                        aria-label="Xoá chương"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {lastAddedChapterId && (
              <button className="kd-btn-secondary" onClick={onReadNow}>
                Đọc thử ngay
              </button>
            )}
            <button className="kd-btn-secondary" onClick={onFinish}>
              Xong, về thư viện
            </button>
          </>
        )}
      </div>
    </div>
  );
}
