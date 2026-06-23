import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { Orientation, SceneProps } from '../types';
import { ImageFrame } from './ImageFrame';
import { TitleCard } from './TitleCard';
import { LowerThird } from './LowerThird';
import { ChapterChip } from './ChapterChip';

export const Scene: React.FC<{ scene: SceneProps; orientation: Orientation }> = ({
  scene,
  orientation,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const isTitle = scene.images.length === 0;

  const fade = interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 28%, #173a5a 0%, #0b1f33 70%)',
      }}
    >
      {isTitle ? (
        <TitleCard title={scene.title ?? scene.part} subtitle="Seeclub Stäfa" opacity={fade} />
      ) : (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fade }}>
          {scene.images.map((img, i) => (
            <ImageFrame
              key={`${img}-${i}`}
              img={img}
              index={i}
              count={scene.images.length}
              orientation={orientation}
            />
          ))}
        </AbsoluteFill>
      )}

      {!isTitle && <ChapterChip label={scene.part} opacity={fade} />}
      {scene.platformHint && <LowerThird text={scene.platformHint} opacity={fade} />}

      {scene.audio && (
        <Sequence from={Math.round(scene.padBefore * fps)}>
          <Audio src={staticFile(scene.audio)} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
