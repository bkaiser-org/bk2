import React from 'react';
import { AbsoluteFill } from 'remotion';

/** Bottom-centred pill for the Plattform-Hinweis einblendung. */
export const LowerThird: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => {
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '7%', opacity }}>
      <div
        style={{
          maxWidth: '80%',
          background: 'rgba(8, 20, 33, 0.86)',
          border: '1px solid rgba(127, 176, 214, 0.4)',
          borderRadius: 999,
          padding: '18px 36px',
          color: '#eaf2fa',
          fontSize: 30,
          fontWeight: 500,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
