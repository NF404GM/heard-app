/**
 * HEARD — useCardFlip Hook
 * Manages the card flip animation state machine with particle effects.
 *
 * Timeline:
 *   Phase 1 (0–150ms): Card rotates 0° → 90° Y. At 45° rotation: particle burst.
 *   Phase 2 (150–300ms): Card rotates 90° → 180° Y.
 *
 * Uses requestAnimationFrame for particle updates.
 * Respects reduced motion and battery state from GPU context.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useGPUContext, useEffectTier } from '../context';
import { FlipParticleSystem } from '../shaders/cardFlip';
import type { CardPaletteData, ParticleData } from '../types/gpu.types';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const FLIP_DURATION_MS = 300;
const PHASE_1_END_MS = 150;
const EMIT_THRESHOLD = 0.5; // normalized progress at which particles emit (45° / 90°)

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════

interface UseCardFlipResult {
  isFlipping: boolean;
  triggerFlip: () => void;
  particles: ReadonlyArray<ParticleData>;
  flipProgress: number; // 0.0 → 1.0 over full 300ms
}

// ═══════════════════════════════════════
// Hook
// ═══════════════════════════════════════

export function useCardFlip(palette: CardPaletteData | null): UseCardFlipResult {
  const { device } = useGPUContext();
  const effectTier = useEffectTier();

  const [isFlipping, setIsFlipping] = useState(false);
  const [particles, setParticles] = useState<ReadonlyArray<ParticleData>>([]);
  const [flipProgress, setFlipProgress] = useState(0);

  const particleSystemRef = useRef<FlipParticleSystem | null>(null);
  const startTimeRef = useRef(0);
  const emittedRef = useRef(false);
  const rafRef = useRef<number>(0);

  // Cleanup particle system on unmount
  useEffect(() => {
    return () => {
      particleSystemRef.current?.destroy();
      particleSystemRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const triggerFlip = useCallback(() => {
    if (isFlipping || !palette) return;

    // For reduced motion: instant flip, no particles
    if (effectTier === 'reduced') {
      setIsFlipping(true);
      setFlipProgress(1.0);
      // Complete immediately
      setTimeout(() => {
        setIsFlipping(false);
        setFlipProgress(0);
      }, 0);
      return;
    }

    // Initialize particle system
    particleSystemRef.current?.destroy();
    particleSystemRef.current = new FlipParticleSystem(
      effectTier === 'full' ? device : null,
      palette,
    );

    setIsFlipping(true);
    setFlipProgress(0);
    setParticles([]);
    emittedRef.current = false;
    startTimeRef.current = performance.now();

    // Animation loop
    function animate(now: number) {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / FLIP_DURATION_MS, 1.0);
      setFlipProgress(progress);

      // Phase 1: check for particle emission point
      const phase1Progress = Math.min(elapsed / PHASE_1_END_MS, 1.0);
      if (!emittedRef.current && phase1Progress >= EMIT_THRESHOLD) {
        emittedRef.current = true;
        particleSystemRef.current?.emit();
      }

      // Update particle physics
      const system = particleSystemRef.current;
      if (system) {
        const deltaTime = 1 / 60; // fixed timestep for consistency
        system.update(deltaTime).then(() => {
          setParticles(system.getParticles());
        });
      }

      if (progress < 1.0) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete — let particles fade out
        finishParticles();
      }
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [isFlipping, palette, device, effectTier]);

  // Continue updating particles after flip completes until all dead
  function finishParticles() {
    const system = particleSystemRef.current;
    if (!system || system.getParticles().length === 0) {
      setIsFlipping(false);
      setParticles([]);
      return;
    }

    function fadeLoop() {
      const sys = particleSystemRef.current;
      if (!sys) {
        setIsFlipping(false);
        setParticles([]);
        return;
      }

      const deltaTime = 1 / 60;
      sys.update(deltaTime).then(() => {
        const remaining = sys.getParticles();
        setParticles(remaining);

        if (remaining.length > 0) {
          rafRef.current = requestAnimationFrame(fadeLoop);
        } else {
          setIsFlipping(false);
          setParticles([]);
          sys.destroy();
          particleSystemRef.current = null;
        }
      });
    }

    rafRef.current = requestAnimationFrame(fadeLoop);
  }

  return { isFlipping, triggerFlip, particles, flipProgress };
}
