import React from 'react';
import { ArrowLeft, Cloud, FileText, PenLine } from 'lucide-react';

export default function AddMethodScreen({ onBack, onManual, onImportText }) {
  return (
    <div className="kd-add-screen">
      <div className="kd-add-header">
        <button className="kd-icon-btn" onClick={onBack} aria-label="Quay lại">
          <ArrowLeft size={20} color="#241F1A" />
        </button>
        <div className="kd-add-title">Thêm truyện mới</div>
      </div>
      <div className="kd-add-body">
        <div className="kd-method-intro">Chọn cách đưa nội dung vào Kệ Đọc.</div>
        <div className="kd-method-list">
          <button className="kd-method-card" onClick={onManual}>
            <span className="kd-method-icon">
              <PenLine size={20} />
            </span>
            <span className="kd-method-copy">
              <span className="kd-method-title">Nhập từng chương thủ công</span>
              <span className="kd-method-description">Tạo truyện rồi thêm từng chương như hiện tại.</span>
            </span>
          </button>

          <button className="kd-method-card" onClick={onImportText}>
            <span className="kd-method-icon">
              <FileText size={20} />
            </span>
            <span className="kd-method-copy">
              <span className="kd-method-title">Import từ văn bản</span>
              <span className="kd-method-description">Dán toàn bộ truyện và tự nhận diện chương.</span>
            </span>
          </button>

          <button className="kd-method-card kd-method-disabled" disabled>
            <span className="kd-method-icon">
              <Cloud size={20} />
            </span>
            <span className="kd-method-copy">
              <span className="kd-method-title-row">
                <span className="kd-method-title">Import từ Google Docs</span>
                <span className="kd-coming-soon">Sắp có</span>
              </span>
              <span className="kd-method-description">Kết nối trực tiếp với tài liệu trên Drive.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

