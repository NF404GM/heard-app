/**
 * HEARD — useGPUCard Hook
 * The main consumer hook used in <CardComponent />.
 * Orchestrates all GPU systems for a single card.
 *
 * Usage:
 *   const { canvasRef, isGPUReady, palette } = useGPUCard({
 *     card,
 *     isFlipping,
 *     isPlaying,
 *     playbackTime,
 *     inCircleFeed,
 *   });
 *   // Attach canvasRef to a <Canvas> from react-native-wgpu
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useGPUContext, useEffectTier } from '../context';
import { useColorExtraction } from './useColorExtraction';
import { useCardFlip } from './useCardFlip';
import { CardRenderPipeline, getFrameTier } from '../pipelines/cardRenderPipeline';
import { evaluateBadges } from '../../badges/badgeEvaluator';
import type { HEARDCard, HEARDUser, CardPaletteData } from '../types/gpu.types';

// ═══════════════════════════════════════
// Hook Input
// ═══════════════════════════════════════

interface UseGPUCardInput {
  card: HEARDCard;
  user?: HEARDUser;
  isFlipping?: boolean;
  isPlaying?: boolean;
  playbackTime?: number;
  inCircleFeed?: boolean;
}

// ═══════════════════════════════════════
// Hook Output
// ═══════════════════════════════════════

interface UseGPUCardOutput {
  canvasRef: React.RefObject<any>;
  isGPUReady: boolean;
  palette: CardPaletteData | null;
  frameTier: number;
  flipProgress: number;
  triggerFlip: () => void;
}

// ═══════════════════════════════════════
// Shared RAF loop — single loop for all visible cards
// ═══════════════════════════════════════

type RAFCallback = (time: number, deltaTime: number) => void;
const rafCallbacks = new Set<RAFCallback>();
let rafId: number | null = null;
let lastTime = 0;

function startRAFLoop() {
  if (rafId !== null) return;

  function loop(timestamp: number) {
    const deltaTime = lastTime ? (timestamp - lastTime) / 1000 : 0.016;
    lastTime = timestamp;

    for (const cb of rafCallbacks) {
      cb(timestamp / 1000, deltaTime);
    }

    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);
}

function stopRAFLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
    lastTime = 0;
  }
}

function registerRAFCallback(cb: RAFCallback): () => void {
  rafCallbacks.add(cb);
  startRAFLoop();
  return () => {
    rafCallbacks.delete(cb);
    if (rafCallbacks.size === 0) stopRAFLoop();
  };
}

// ═══════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════

export function useGPUCard(input: UseGPUCardInput): UseGPUCardOutput {
  const {
    card,
    user,
    isFlipping = false,
    isPlaying = false,
    playbackTime = 0,
    inCircleFeed = false,
  } = input;

  const canvasRef = useRef<any>(null);
  const pipelineRef = useRef<CardRenderPipeline | null>(null);
  const [isGPUReady, setIsGPUReady] = useState(false);

  // GPU context
  const gpuCtx = useGPUContext();
  const effectTier = useEffectTier();

  // Color extraction (System 1)
  // Pass existing palette from card data to avoid web-only Image API on native
  const { palette, isExtracting } = useColorExtraction(card.coverArtUrl, card.palette);

  // Card flip (System 2)
  const { triggerFlip, flipProgress, particles } = useCardFlip(palette);

  // Frame tier (System 6)
  const frameTier = getFrameTier(card);

  // Badge evaluation (System 7)
  const badges = user && palette
    ? evaluateBadges(card, user, palette, 320, 426)
    : [];

  // ── Initialize pipeline ──
  useEffect(() => {
    if (!gpuCtx.device || effectTier === 'fallback') return;

    const pipeline = new CardRenderPipeline(gpuCtx.device);
    pipelineRef.current = pipeline;

    // Initialize with card dimensions (3:4 aspect ratio)
    const width = 360;
    const height = 480;
    pipeline.initialize(width, height).then(() => {
      setIsGPUReady(true);

      // Upload waveform data if available
      if (card.waveformData) {
        pipeline.uploadWaveform(card.waveformData);
      }
    });

    return () => {
      pipeline.destroy();
      pipelineRef.current = null;
      setIsGPUReady(false);
    };
  }, [gpuCtx.device, card.id]);

  // ── Main render loop ──
  useEffect(() => {
    if (!isGPUReady || !palette || effectTier === 'fallback') return;

    const unregister = registerRAFCallback((time, deltaTime) => {
      const pipeline = pipelineRef.current;
      if (!pipeline) return;

      // Skip rendering when app is backgrounded
      if (AppState.currentState !== 'active') return;

      // Reduced motion: only static rendering
      if (effectTier === 'reduced') {
        pipeline.render({
          card,
          palette,
          frameTier: 0, // Force COMMON frame
          badges,
          waveformData: card.waveformData || [],
          isFlipping: false,
          flipProgress: 0,
          isPlaying: false,
          playbackTime: 0,
          inCircleFeed: false,
          bpm: card.bpm || 120,
          time,
          deltaTime,
        });
        return;
      }

      // Full rendering
      pipeline.render({
        card,
        palette,
        frameTier,
        badges,
        waveformData: card.waveformData || [],
        isFlipping,
        flipProgress,
        isPlaying,
        playbackTime,
        inCircleFeed,
        bpm: card.bpm || 120,
        time,
        deltaTime,
      });
    });

    return unregister;
  }, [isGPUReady, palette, effectTier, isFlipping, isPlaying, playbackTime, inCircleFeed]);

  return {
    canvasRef,
    isGPUReady,
    palette,
    frameTier,
    flipProgress,
    triggerFlip,
  };
}

export default useGPUCard;
