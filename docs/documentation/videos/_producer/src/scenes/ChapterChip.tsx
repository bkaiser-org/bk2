import React from 'react';
import { AbsoluteFill } from 'remotion';

/** Small top-left chip showing the current part / chapter. */
export const ChapterChip: React.FC<{ label: string; opacity: number }> = ({ label, opacity }) => {
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-start', padding: 48, opacity }}>
      <div
        style={{
          background: 'rgba(63, 167, 255, 0.18)',
          border: '1px solid rgba(63, 167, 255, 0.5)',
          borderRadius: 10,
          padding: '10px 20px',
          color: '#cfe6fb',
          fontSize: 24,
          fontWeight: 600,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};
