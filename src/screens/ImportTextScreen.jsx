import React, { useState } from 'react';
import { AlertTriangle, ArrowLeft, BookOpen, ChevronRight, FileText, Save } from 'lucide-react';
import { parseStoryText } from '../utils/textImportParser';

export default function ImportTextScreen({ onBack, onSave }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  function handleParse() {
    const result = parseStoryText(text);
    if (result.error) {
      setPreview(null);
      setError(result.error);
      return;
    }

    setError('');
    setPreview(result);
  }

  function handleEditText() {
    setPreview(null);
    setError('');
  }

  return (
    <div className="kd-add-screen">
      <div className="kd-add-header">
        <button
          className="kd-icon-btn"
          onClick={preview ? handleEditText : onBack}
          aria-label="Quay lại"
        >
          <ArrowLeft size={20} color="#241F1A" />
        </button>
        <div className="kd-add-title">Import từ văn bản</div>
      </div>

      <div className="kd-add-body">
        {!preview ? (
          <>
            <div className="kd-field-label">Tên truyện</div>
            <input
              className="kd-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ví dụ: Những Buổi Tối Không Tên"
            />

            <div className="kd-field-label">Tác giả / dịch giả (không bắt buộc)</div>
            <input
              className="kd-input"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Để trống nếu không cần"
            />

            <div className="kd-field-label">Toàn bộ nội dung</div>
            <textarea
              className="kd-textarea kd-import-textarea"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                if (error) setError('');
              }}
              placeholder={'Hồi 1: Khởi Đầu\n\nChương 1: Ngày Đầu Tiên\n\nDán nội dung chương ở đây...'}
            />

            {error && <div className="kd-import-error">{error}</div>}

            <button
              className="kd-btn-primary kd-import-action-primary"
              disabled={!text.trim()}
              onClick={handleParse}
            >
              <FileText size={16} /> Tự tách chương
            </button>
          </>
        ) : (
          <>
            <div className="kd-preview-heading">
              <div className="kd-preview-eyebrow">Kết quả nhận diện</div>
              <div className="kd-preview-story-title">{title.trim() || 'Truyện chưa đặt tên'}</div>
              {author.trim() && <div className="kd-preview-author">{author.trim()}</div>}
            </div>

            <div className="kd-import-summary">
              <div className="kd-summary-item">
                <BookOpen size={18} />
                <span>
                  <strong>{preview.stats.sectionCount}</strong> hồi/phần
                </span>
              </div>
              <div className="kd-summary-item">
                <FileText size={18} />
                <span>
                  <strong>{preview.stats.chapterCount}</strong> chương
                </span>
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className="kd-import-warnings">
                <div className="kd-import-warnings-title">
                  <AlertTriangle size={15} /> {preview.stats.warningCount} cảnh báo
                </div>
                <ul>
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="kd-preview-tree">
              {preview.sections.map((section) => (
                <div className="kd-preview-section" key={section.id}>
                  <div className="kd-preview-section-title">{section.title}</div>
                  <div className="kd-preview-chapters">
                    {section.chapters.map((chapter) => (
                      <div className="kd-preview-chapter" key={chapter.id}>
                        <ChevronRight size={15} />
                        <span>{chapter.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              className="kd-btn-primary kd-import-action-primary"
              disabled={!title.trim()}
              onClick={() =>
                onSave({
                  title: title.trim(),
                  author: author.trim(),
                  sections: preview.sections,
                })
              }
            >
              <Save size={16} /> Lưu vào kệ đọc
            </button>
            {!title.trim() && (
              <div className="kd-import-hint">Nhập tên truyện trước khi lưu.</div>
            )}
            <button
              className="kd-btn-secondary kd-import-action-secondary"
              onClick={handleEditText}
            >
              Quay lại chỉnh văn bản
            </button>
          </>
        )}
      </div>
    </div>
  );
}
