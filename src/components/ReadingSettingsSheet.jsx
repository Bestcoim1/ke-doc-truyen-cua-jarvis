import React from 'react';
import { X } from 'lucide-react';
import { FONT_SIZES, LINE_HEIGHTS } from '../constants/readerSettings';

export default function ReadingSettingsSheet({ settings, onUpdateSettings, onClose }) {
  return (
    <>
      <div className="kd-overlay-backdrop" onClick={onClose} />
      <div className="kd-settings-sheet">
        <div className="kd-sheet-handle" />
        <div className="kd-sheet-header">
          <div className="kd-sheet-title">Tuỳ chỉnh đọc</div>
          <button className="kd-icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={19} color="#241F1A" />
          </button>
        </div>

        <div className="kd-settings-row">
          <div className="kd-settings-label">Cỡ chữ</div>
          <div className="kd-pill-group">
            {FONT_SIZES.map((fontSize) => (
              <button
                key={fontSize}
                className={'kd-pill' + (settings.fontSize === fontSize ? ' kd-pill-active' : '')}
                onClick={() => onUpdateSettings({ fontSize })}
              >
                {fontSize}
              </button>
            ))}
          </div>
        </div>

        <div className="kd-settings-row">
          <div className="kd-settings-label">Khoảng cách dòng</div>
          <div className="kd-pill-group">
            {LINE_HEIGHTS.map((lineHeight) => (
              <button
                key={lineHeight}
                className={'kd-pill' + (settings.lineHeight === lineHeight ? ' kd-pill-active' : '')}
                onClick={() => onUpdateSettings({ lineHeight })}
              >
                {lineHeight.toFixed(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="kd-settings-row">
          <div className="kd-settings-label">Giao diện</div>
          <div className="kd-pill-group">
            {[
              ['light', 'Sáng', '#F7F1E4'],
              ['dark', 'Tối', '#14181C'],
              ['sepia', 'Sepia', '#EAD9BA'],
            ].map(([key, label, swatch]) => (
              <button
                key={key}
                className={'kd-pill' + (settings.theme === key ? ' kd-pill-active' : '')}
                onClick={() => onUpdateSettings({ theme: key })}
              >
                <span className="kd-theme-swatch" style={{ background: swatch }} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
