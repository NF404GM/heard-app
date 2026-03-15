/**
 * HEARD — useWaveform Hook
 * Manages waveform visualization rendering on a canvas element.
 *
 * Modes:
 *   Static: Smooth Bezier curve, muted color @ 40% opacity, bottom 20% of card.
 *   Active: Left-to-right playback illumination with cursor dot.
 *
 * Falls back to Canvas 2D rendering if WebGPU is unavailable.
 * All colors derive from CardPalette — no hardcoded colors.
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { useGPUContext, useEffectTier } from '../context';
import { WaveformRenderer } from '../shaders/waveform';
import type { CardPaletteData } from '../types/gpu.types';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const WAVEFORM_SAMPLES = 512;

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════

interface UseWaveformResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isReady: boolean;
}

interface PlaybackState {
  isPlaying: boolean;
  progress: number;
}

// ═══════════════════════════════════════
// Hook
// ═══════════════════════════════════════

export function useWaveform(
  waveformData: number[] | null,
  palette: CardPaletteData | null,
): UseWaveformResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const { device } = useGPUContext();
  const effectTier = useEffectTier();

  const rendererRef = useRef<WaveformRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const playbackRef = useRef<PlaybackState>({ isPlaying: false, progress: 0 });

  // Initialize renderer when canvas, data, and palette are all available
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData || !palette) {
      setIsReady(false);
      return;
    }

    // Cleanup previous renderer
    rendererRef.current?.destroy();
    rendererRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

    if (effectTier !== 'fallback' && device) {
      // GPU path
      try {
        const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
        if (ctx) {
          ctx.configure({
            device,
            format: 'bgra8unorm',
            alphaMode: 'premultiplied',
          });

          rendererRef.current = new WaveformRenderer(
            device,
            ctx,
            palette,
            waveformData,
          );
          setIsReady(true);
          startGPURenderLoop();
          return;
        }
      } catch {
        // Fall through to CPU fallback
      }
    }

    // CPU fallback — Canvas 2D
    setIsReady(true);
    startCPURenderLoop(canvas, waveformData, palette);

    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [waveformData, palette, device, effectTier]);

  // GPU render loop
  function startGPURenderLoop(): void {
    startTimeRef.current = performance.now();

    function loop(now: number) {
      const renderer = rendererRef.current;
      if (!renderer) return;

      const time = (now - startTimeRef.current) / 1000;
      const { isPlaying, progress } = playbackRef.current;
      renderer.render(time, isPlaying, progress);

      // Only keep animating if playing, otherwise render once
      if (isPlaying) {
        rafRef.current = requestAnimationFrame(loop);
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }

  // CPU fallback render loop
  function startCPURenderLoop(
    canvas: HTMLCanvasElement,
    data: number[],
    pal: CardPaletteData,
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    startTimeRef.current = performance.now();

    function drawFrame(now: number) {
      const c = canvasRef.current;
      if (!c) return;
      const c2d = c.getContext('2d');
      if (!c2d) return;

      const width = c.width;
      const height = c.height;
      const { isPlaying, progress } = playbackRef.current;
      const time = (now - startTimeRef.current) / 1000;

      // Clear
      c2d.clearRect(0, 0, width, height);

      // Waveform occupies bottom 20% of canvas
      const waveY = height * 0.8;
      const waveH = height * 0.15;

      // Draw waveform as filled path with Catmull-Rom smoothing
      c2d.beginPath();

      const sampleCount = Math.min(data.length, WAVEFORM_SAMPLES);
      if (sampleCount < 2) return;

      // Bottom line
      c2d.moveTo(0, waveY);

      // Top edge with smooth interpolation
      for (let x = 0; x < width; x++) {
        const normalizedX = x / width;
        const sampleIdx = normalizedX * (sampleCount - 1);
        const amplitude = catmullRomSample(data, sampleIdx, sampleCount);

        // Pulse effect when playing
        let pulse = 1.0;
        if (isPlaying) {
          pulse = 1.0 + 0.05 * Math.sin(time * 3.0 + normalizedX * 6.28);
        }

        const y = waveY - amplitude * waveH * pulse;
        c2d.lineTo(x, y);
      }

      // Close bottom
      c2d.lineTo(width, waveY);
      c2d.closePath();

      if (isPlaying) {
        // Split into played and unplayed regions
        const splitX = progress * width;

        // Played portion: accent @ 80%
        c2d.save();
        c2d.clip();
        c2d.fillStyle = vec4ToRgba(pal.accent, 0.8);
        c2d.fillRect(0, 0, splitX, height);

        // Unplayed portion: muted @ 30%
        c2d.fillStyle = vec4ToRgba(pal.muted, 0.3);
        c2d.fillRect(splitX, 0, width - splitX, height);
        c2d.restore();

        // Cursor dot
        const cursorSampleIdx = progress * (sampleCount - 1);
        const cursorAmplitude = catmullRomSample(data, cursorSampleIdx, sampleCount);
        const cursorY = waveY - cursorAmplitude * waveH;

        c2d.beginPath();
        c2d.arc(splitX, cursorY, 3, 0, Math.PI * 2);
        c2d.fillStyle = vec4ToRgba(pal.accent, 1.0);
        c2d.fill();
      } else {
        // Static mode: muted @ 40%
        c2d.fillStyle = vec4ToRgba(pal.muted, 0.4);
        c2d.fill();
      }

      if (isPlaying) {
        rafRef.current = requestAnimationFrame(drawFrame);
      }
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }

  // Expose a way for external code to update playback state
  // The canvas element gets data attributes that can be read
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new MutationObserver(() => {
      const playing = canvas.dataset.playing === 'true';
      const prog = parseFloat(canvas.dataset.progress || '0');
      const wasPlaying = playbackRef.current.isPlaying;
      playbackRef.current = { isPlaying: playing, progress: prog };

      // Restart render loop if playback started
      if (playing && !wasPlaying) {
        if (rendererRef.current) {
          startGPURenderLoop();
        } else if (canvasRef.current) {
          // Re-trigger a single frame for static update
          rafRef.current = requestAnimationFrame((now) => {
            const c = canvasRef.current;
            if (c && waveformData && palette) {
              startCPURenderLoop(c, waveformData, palette);
            }
          });
        }
      }

      // Render one final frame when stopping
      if (!playing && wasPlaying) {
        if (rendererRef.current) {
          const time = (performance.now() - startTimeRef.current) / 1000;
          rendererRef.current.render(time, false, prog);
        }
      }
    });

    observer.observe(canvas, { attributes: true, attributeFilter: ['data-playing', 'data-progress'] });

    return () => observer.disconnect();
  }, [waveformData, palette]);

  return { canvasRef, isReady };
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

/**
 * Catmull-Rom spline interpolation for smooth waveform sampling.
 */
function catmullRomSample(data: number[], idx: number, count: number): number {
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, count - 1);
  const iPrev = Math.max(i0 - 1, 0);
  const iNext = Math.min(i1 + 1, count - 1);
  const t = idx - i0;

  const p0 = data[iPrev] ?? 0;
  const p1 = data[i0] ?? 0;
  const p2 = data[i1] ?? 0;
  const p3 = data[iNext] ?? 0;

  const t2 = t * t;
  const t3 = t2 * t;

  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * Convert a vec4f-style color to CSS rgba() string.
 * Components are in 0–1 range.
 */
function vec4ToRgba(
  color: { x: number; y: number; z: number; w: number },
  alphaOverride: number,
): string {
  const r = Math.round(color.x * 255);
  const g = Math.round(color.y * 255);
  const b = Math.round(color.z * 255);
  return `rgba(${r}, ${g}, ${b}, ${alphaOverride})`;
}
