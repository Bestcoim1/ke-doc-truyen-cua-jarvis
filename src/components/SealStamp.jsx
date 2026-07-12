import React from 'react';

export default function SealStamp({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9.5" fill="#A23B2E" opacity="0.92" />
      <path
        d="M7.5 12.5c1.6-2.2 2.8-2.2 4.5 0s2.9 2.2 4.5 0"
        stroke="#FBF3E4"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
