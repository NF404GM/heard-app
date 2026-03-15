/**
 * HEARD — CSS Frame Fallback
 * When GPU is unavailable, card frames are rendered with pure CSS.
 * Produces React Native StyleSheet-compatible styles for each frame tier.
 */

import type { CardPaletteData, FrameTier } from '../types/gpu.types';
import { FRAME_TIERS } from '../types/gpu.types';

interface FrameStyle {
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  // Additional properties for higher tiers
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  // For web/CSS compatibility
  boxShadow?: string;
}

/**
 * Convert vec4f RGBA to CSS hex color
 */
function vec4ToHex(v: { x: number; y: number; z: number; w: number }): string {
  const r = Math.round(v.x * 255);
  const g = Math.round(v.y * 255);
  const b = Math.round(v.z * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function vec4ToRGBA(v: { x: number; y: number; z: number; w: number }, alpha?: number): string {
  const r = Math.round(v.x * 255);
  const g = Math.round(v.y * 255);
  const b = Math.round(v.z * 255);
  const a = alpha ?? v.w;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Get CSS frame styles for a card based on its tier and palette.
 * This is the CPU/CSS fallback when GPU frames are unavailable.
 */
export function getStaticFrameStyle(
  tier: FrameTier,
  palette: CardPaletteData | null
): FrameStyle {
  const defaultColor = '#1A1A1E';
  const dominantHex = palette ? vec4ToHex(palette.dominant) : defaultColor;
  const accentHex = palette ? vec4ToHex(palette.accent) : '#C9A84C';

  const base: FrameStyle = {
    borderWidth: 2,
    borderColor: dominantHex,
    borderRadius: 12,
  };

  switch (tier) {
    case FRAME_TIERS.COMMON:
      return base;

    case FRAME_TIERS.WARM:
      return {
        ...base,
        shadowColor: accentHex,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        boxShadow: palette
          ? `0 0 8px ${vec4ToRGBA(palette.accent, 0.4)}`
          : `0 0 8px rgba(201, 168, 76, 0.4)`,
      };

    case FRAME_TIERS.FOIL:
      // Static foil: use a subtle gradient border effect via boxShadow
      return {
        ...base,
        borderColor: '#F0EEE9',
        shadowColor: accentHex,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        boxShadow: palette
          ? `0 0 6px ${vec4ToRGBA(palette.accent, 0.3)}, inset 0 0 2px rgba(240, 238, 233, 0.2)`
          : `0 0 6px rgba(201, 168, 76, 0.3)`,
      };

    case FRAME_TIERS.CHROMA:
      // Static chroma: offset colored shadows to simulate aberration
      return {
        ...base,
        borderWidth: 2,
        boxShadow: [
          `1.5px 0 0 rgba(255, 0, 0, 0.3)`,
          `-1.5px 0 0 rgba(0, 0, 255, 0.3)`,
          `0 0 4px ${palette ? vec4ToRGBA(palette.dominant, 0.2) : 'rgba(26, 26, 30, 0.2)'}`,
        ].join(', '),
      };

    case FRAME_TIERS.LIVING:
      // Static living: prominent glow with accent color
      return {
        ...base,
        borderWidth: 2,
        borderColor: accentHex,
        shadowColor: accentHex,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        boxShadow: palette
          ? `0 0 12px ${vec4ToRGBA(palette.accent, 0.6)}, 0 0 4px ${vec4ToRGBA(palette.accent, 0.3)}`
          : `0 0 12px rgba(201, 168, 76, 0.6)`,
      };

    default:
      return base;
  }
}

/**
 * Get a static waveform SVG path for CPU fallback rendering.
 * Generates a smooth Bezier curve from waveform samples.
 */
export function getStaticWaveformPath(
  samples: number[],
  width: number,
  height: number,
  yOffset: number = 0
): string {
  if (samples.length === 0) {
    // Generate gentle sine wave fallback
    const points: string[] = [];
    for (let i = 0; i <= 50; i++) {
      const x = (i / 50) * width;
      const y = yOffset + height / 2 + Math.sin(i * 0.3) * (height * 0.3);
      points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
    }
    return points.join(' ');
  }

  // Downsample to reasonable point count
  const step = Math.max(1, Math.floor(samples.length / 100));
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < samples.length; i += step) {
    const x = (i / samples.length) * width;
    const amplitude = samples[i] * height * 0.8;
    const y = yOffset + height / 2 - amplitude / 2;
    points.push({ x, y });
  }

  // Build smooth Bezier path
  if (points.length < 2) return '';

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` Q ${cpx} ${prev.y} ${curr.x} ${curr.y}`;
  }

  return d;
}
