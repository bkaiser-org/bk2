import React from 'react';
import { AbsoluteFill } from 'remotion';

export const TitleCard: React.FC<{ title: string; subtitle?: string; opacity: number }> = ({
  title,
  subtitle,
  opacity,
}) => {
  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '0 12%',
      }}
    >
      {subtitle && (
        <div style={{ fontSize: 34, letterSpacing: 6, color: '#7fb0d6', marginBottom: 28 }}>
          {subtitle.toUpperCase()}
        </div>
      )}
      <div style={{ fontSize: 78, fontWeight: 800, color: '#ffffff', lineHeight: 1.15 }}>{title}</div>
      <div
        style={{
          marginTop: 40,
          width: 120,
          height: 6,
          borderRadius: 3,
          background: 'linear-gradient(90deg, #3fa7ff, #7fe0c4)',
        }}
      />
    </AbsoluteFill>
  );
};
