/**
 * HEARD — useCircleAmbient Hook
 * Manages the Close Circle ambient particle field visualization.
 *
 * 256 particles drift with BPM-synced motion, max 15% opacity.
 * Falls back to a simple Canvas 2D particle system when GPU unavailable.
 * All colors derive from CardPalette.
 *
 * Usage:
 *   const { canvasRef, isReady } = useCircleAmbient(palette, bpm, isVisible);
 */
import { useRef, useEffect, useState } from 'react';
import { useGPUContext, useEffectTier } from '../context';
import {
  createCircleAmbientPipeline,
  updateCircleAmbientParticles,
  writeCircleAmbientRenderUniforms,
  type CircleAmbientResources,
} from '../shaders/ambient/circleAmbient';
import type { CardPaletteData } from '../types/gpu.types';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const PARTICLE_COUNT = 256;
const MAX_ALPHA = 0.15;

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════

interface UseCircleAmbientResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isReady: boolean;
}

// ═══════════════════════════════════════
// CPU Fallback Particle
// ═══════════════════════════════════════

interface CPUParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
  alpha: number;
  useAccent: boolean;
}

function initCPUParticles(): CPUParticle[] {
  const particles: CPUParticle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      phase: Math.random(),
      size: 2 + Math.random() * 4,
      alpha: 0.02 + Math.random() * (MAX_ALPHA - 0.02),
      useAccent: i % 2 === 0,
    });
  }
  return particles;
}

// ═══════════════════════════════════════
// Hook
// ═══════════════════════════════════════

export function useCircleAmbient(
  palette: CardPaletteData | null,
  bpm: number,
  isVisible: boolean,
): UseCircleAmbientResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const { device } = useGPUContext();
  const effectTier = useEffectTier();

  const resourcesRef = useRef<CircleAmbientResources | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const startTimeRef = useRef(0);
  const cpuParticlesRef = useRef<CPUParticle[] | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !palette || !isVisible) {
      setIsReady(false);
      return;
    }

    // Cleanup previous
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    resourcesRef.current = null;
    cpuParticlesRef.current = null;

    // Reduced motion: render nothing (static bg only)
    if (effectTier === 'fallback') {
      setIsReady(true);
      return;
    }

    if (device) {
      // GPU path
      try {
        const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
        if (ctx) {
          ctx.configure({
            device,
            format: 'bgra8unorm',
            alphaMode: 'premultiplied',
          });

          resourcesRef.current = createCircleAmbientPipeline(device);
          setIsReady(true);
          startGPURenderLoop(ctx);
          return;
        }
      } catch {
        // Fall through to CPU
      }
    }

    // CPU fallback
    cpuParticlesRef.current = initCPUParticles();
    setIsReady(true);
    startCPURenderLoop(canvas);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      resourcesRef.current = null;
      cpuParticlesRef.current = null;
    };
  }, [palette, device, effectTier, isVisible]);

  // GPU render loop
  function startGPURenderLoop(ctx: GPUCanvasContext): void {
    startTimeRef.current = performance.now();
    lastTimeRef.current = performance.now();

    function loop(now: number) {
      const res = resourcesRef.current;
      if (!res || !palette) return;

      const deltaTime = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;
      const time = (now - startTimeRef.current) / 1000;

      // Update particles
      const computeCmd = updateCircleAmbientParticles(res, deltaTime, bpm, time);
      res.device.queue.submit([computeCmd]);

      // Write render uniforms
      const canvas = canvasRef.current;
      if (!canvas) return;
      writeCircleAmbientRenderUniforms(res, palette, canvas.width, canvas.height, time);

      // Render
      const textureView = ctx.getCurrentTexture().createView();
      const encoder = res.device.createCommandEncoder({ label: 'Circle Ambient Render' });
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      pass.setPipeline(res.renderPipeline);
      pass.setBindGroup(0, res.renderBindGroup);
      pass.draw(6);
      pass.end();
      res.device.queue.submit([encoder.finish()]);

      if (isVisible) {
        rafRef.current = requestAnimationFrame(loop);
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }

  // CPU fallback render loop
  function startCPURenderLoop(canvas: HTMLCanvasElement): void {
    startTimeRef.current = performance.now();
    lastTimeRef.current = performance.now();

    function drawFrame(now: number) {
      const c = canvasRef.current;
      const particles = cpuParticlesRef.current;
      if (!c || !particles || !palette) return;

      const ctx = c.getContext('2d');
      if (!ctx) return;

      const deltaTime = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;
      const time = (now - startTimeRef.current) / 1000;

      const width = c.width;
      const height = c.height;
      const bpmFactor = Math.max(bpm, 60) / 120;

      ctx.clearRect(0, 0, width, height);

      const beatPhase = time * bpmFactor * Math.PI;

      for (const p of particles) {
        const beatPulse = Math.sin(beatPhase + p.phase) * 0.3 + 0.7;
        const driftSpeed = 0.02 * bpmFactor;

        // Update position
        p.x += p.vx * driftSpeed * deltaTime * beatPulse;
        p.y += p.vy * driftSpeed * deltaTime * beatPulse;

        // Wrap
        if (p.x < -0.1) p.x = 1.1;
        if (p.x > 1.1) p.x = -0.1;
        if (p.y < -0.1) p.y = 1.1;
        if (p.y > 1.1) p.y = -0.1;

        // Wobble
        p.x += Math.sin(time * 0.5 + p.phase * 6.28) * 0.001;
        p.y += Math.cos(time * 0.3 + p.phase * 6.28) * 0.001;

        // Draw soft circle
        const px = p.x * width;
        const py = p.y * height;
        const currentAlpha = p.alpha * (0.5 + beatPulse * 0.5);
        const color = p.useAccent ? palette.accent : palette.muted;

        const r = Math.round(color.x * 255);
        const g = Math.round(color.y * 255);
        const b = Math.round(color.z * 255);

        const gradient = ctx.createRadialGradient(px, py, 0, px, py, p.size * 2);
        gradient.addColorStop(0, `rgba(${r},${g},${b},${currentAlpha})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, p.size * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isVisible) {
        rafRef.current = requestAnimationFrame(drawFrame);
      }
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }

  return { canvasRef, isReady };
}
