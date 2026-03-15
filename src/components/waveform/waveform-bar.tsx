import { View, StyleSheet } from 'react-native';
import type { CardPaletteData } from '../../gpu/types/gpu.types';
import { tokens } from '../../theme/tokens';

interface WaveformBarProps {
  data: number[];
  palette: CardPaletteData | null;
  width: number;
  height: number;
  playbackProgress?: number;
}

function vec4ToRGBA(v: { x: number; y: number; z: number; w: number }, alpha: number): string {
  const r = Math.round(v.x * 255);
  const g = Math.round(v.y * 255);
  const b = Math.round(v.z * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function WaveformBar({ data, palette, width, height, playbackProgress = 0 }: WaveformBarProps) {
  const barCount = 40;
  const step = Math.max(1, Math.floor(data.length / barCount));
  const barWidth = (width / barCount) * 0.6;
  const barGap = (width / barCount) * 0.4;

  const staticColor = palette
    ? vec4ToRGBA(palette.muted, 0.4)
    : `${tokens.colors.textMuted}66`;
  const activeColor = palette
    ? vec4ToRGBA(palette.accent, 0.8)
    : tokens.colors.gold;

  const bars: { amplitude: number; isPlayed: boolean }[] = [];
  for (let i = 0; i < barCount; i++) {
    const sampleIdx = Math.min(i * step, data.length - 1);
    const amplitude = data[sampleIdx] ?? 0.1;
    const isPlayed = (i / barCount) < playbackProgress;
    bars.push({ amplitude, isPlayed });
  }

  return (
    <View style={[styles.container, { width, height }]}>
      {bars.map((bar, i) => {
        const barHeight = Math.max(2, bar.amplitude * height * 0.9);
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              height: barHeight,
              backgroundColor: bar.isPlayed ? activeColor : staticColor,
              borderRadius: 1,
              marginHorizontal: barGap / 2,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
