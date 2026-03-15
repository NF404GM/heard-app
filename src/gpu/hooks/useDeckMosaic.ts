/**
 * HEARD — useDeckMosaic Hook
 * Manages deck mosaic rendering with cover art grid, parallax, and color bleed.
 *
 * Creates a texture atlas from cover art URLs, configures the mosaic shader,
 * and provides an aggregate deck palette derived from visible cards.
 *
 * Falls back to Canvas 2D grid rendering when GPU unavailable.
 *
 * Usage:
 *   const { canvasRef, deckPalette } = useDeckMosaic(coverUrls, scrollOffset);
 */
import { useRef, useEffect, useState, useMemo } from 'react';
import { useGPUContext, useEffectTier } from '../context';
import {
  createDeckMosaicPipeline,
  createMosaicBindGroup,
  writeMosaicUniforms,
  deriveDeckPalette,
  type DeckMosaicResources,
  type MosaicCell,
} from '../shaders/mosaic/deckMosaic';
import type { CardPaletteData } from '../types/gpu.types';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const MAX_CELLS = 16;
const ATLAS_CELL_SIZE = 256; // px per cover in atlas
const GAP_PX = 4;
const COLOR_BLEED = 0.5;

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════

export interface CoverEntry {
  url: string;
  palette: CardPaletteData;
}

interface UseDeckMosaicResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  deckPalette: CardPaletteData | null;
}

// ═══════════════════════════════════════
// Hook
// ═══════════════════════════════════════

export function useDeckMosaic(
  covers: CoverEntry[],
  scrollOffset: number,
): UseDeckMosaicResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { device } = useGPUContext();
  const effectTier = useEffectTier();

  const resourcesRef = useRef<DeckMosaicResources | null>(null);
  const bindGroupRef = useRef<GPUBindGroup | null>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const scrollRef = useRef(scrollOffset);
  const rafRef = useRef<number>(0);

  // Always keep scroll ref updated
  scrollRef.current = scrollOffset;

  // Derive deck palette from all cover palettes
  const deckPalette = useMemo(() => {
    return deriveDeckPalette(covers.map((c) => c.palette));
  }, [covers]);

  // Compute grid dimensions
  const cellCount = Math.min(covers.length, MAX_CELLS);
  const gridCols = cellCount <= 1 ? 1 : cellCount <= 4 ? 2 : cellCount <= 9 ? 3 : 4;
  const gridRows = Math.ceil(cellCount / gridCols);

  // Load cover images
  useEffect(() => {
    let cancelled = false;
    const urls = covers.slice(0, MAX_CELLS).map((c) => c.url);

    const promises = urls.map((url) => {
      return new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img); // still resolve — use blank
        img.src = url;
      });
    });

    Promise.all(promises).then((imgs) => {
      if (!cancelled) {
        imagesRef.current = imgs;
        renderMosaic();
      }
    });

    return () => { cancelled = true; };
  }, [covers]);

  // Scroll-driven re-render
  useEffect(() => {
    renderMosaic();
  }, [scrollOffset]);

  function renderMosaic(): void {
    const canvas = canvasRef.current;
    const images = imagesRef.current;
    if (!canvas || images.length === 0) return;

    if (effectTier !== 'fallback' && device) {
      renderGPU(canvas, images);
    } else {
      renderCPU(canvas, images);
    }
  }

  // GPU render path
  function renderGPU(canvas: HTMLCanvasElement, images: HTMLImageElement[]): void {
    if (!device) return;

    try {
      const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
      if (!ctx) {
        renderCPU(canvas, images);
        return;
      }

      ctx.configure({
        device,
        format: 'bgra8unorm',
        alphaMode: 'premultiplied',
      });

      // Create pipeline if needed
      if (!resourcesRef.current) {
        resourcesRef.current = createDeckMosaicPipeline(device);
      }
      const resources = resourcesRef.current;

      // Build texture atlas from loaded images
      const atlasCols = Math.ceil(Math.sqrt(cellCount));
      const atlasRows = Math.ceil(cellCount / atlasCols);
      const atlasWidth = atlasCols * ATLAS_CELL_SIZE;
      const atlasHeight = atlasRows * ATLAS_CELL_SIZE;

      const atlasTexture = device.createTexture({
        label: 'Mosaic Atlas',
        size: [atlasWidth, atlasHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      // Upload each cover image to the atlas
      const offCanvas = new OffscreenCanvas(ATLAS_CELL_SIZE, ATLAS_CELL_SIZE);
      const offCtx = offCanvas.getContext('2d');

      for (let i = 0; i < cellCount; i++) {
        const img = images[i];
        if (!img || !offCtx) continue;

        offCtx.clearRect(0, 0, ATLAS_CELL_SIZE, ATLAS_CELL_SIZE);
        offCtx.drawImage(img, 0, 0, ATLAS_CELL_SIZE, ATLAS_CELL_SIZE);

        const bitmap = offCanvas.transferToImageBitmap();
        device.queue.copyExternalImageToTexture(
          { source: bitmap },
          {
            texture: atlasTexture,
            origin: [
              (i % atlasCols) * ATLAS_CELL_SIZE,
              Math.floor(i / atlasCols) * ATLAS_CELL_SIZE,
            ],
          },
          [ATLAS_CELL_SIZE, ATLAS_CELL_SIZE],
        );
      }

      // Build cell data
      const cells: MosaicCell[] = [];
      for (let i = 0; i < cellCount; i++) {
        const atlasCol = i % atlasCols;
        const atlasRow = Math.floor(i / atlasCols);
        const cover = covers[i];

        cells.push({
          uvRect: {
            x: atlasCol / atlasCols,
            y: atlasRow / atlasRows,
            z: 1 / atlasCols,
            w: 1 / atlasRows,
          },
          dominant: cover.palette.dominant,
          col: i % gridCols,
          row: Math.floor(i / gridCols),
          parallaxX: (i % gridCols) - (gridCols - 1) / 2,
          parallaxY: Math.floor(i / gridCols) - (gridRows - 1) / 2,
        });
      }

      // Create bind group with atlas
      const bindGroup = createMosaicBindGroup(resources, atlasTexture.createView());
      bindGroupRef.current = bindGroup;

      // Write uniforms
      writeMosaicUniforms(
        device,
        resources.uniformBuffer,
        cells,
        gridCols,
        gridRows,
        canvas.width,
        canvas.height,
        GAP_PX,
        scrollRef.current,
        COLOR_BLEED,
      );

      // Render
      const textureView = ctx.getCurrentTexture().createView();
      const encoder = device.createCommandEncoder({ label: 'Deck Mosaic Render' });
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });

      pass.setPipeline(resources.pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
      pass.end();

      device.queue.submit([encoder.finish()]);

      // Clean up atlas texture after rendering
      atlasTexture.destroy();
    } catch {
      renderCPU(canvas, images);
    }
  }

  // CPU fallback render
  function renderCPU(canvas: HTMLCanvasElement, images: HTMLImageElement[]): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const cellW = (width - GAP_PX * (gridCols + 1)) / gridCols;
    const cellH = (height - GAP_PX * (gridRows + 1)) / gridRows;

    for (let i = 0; i < cellCount; i++) {
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);
      const img = images[i];
      const cover = covers[i];

      const cellX = GAP_PX + col * (cellW + GAP_PX);
      const cellY = GAP_PX + row * (cellH + GAP_PX);

      // Parallax offset
      const px = (col - (gridCols - 1) / 2) * scrollRef.current * 0.03;
      const py = (row - (gridRows - 1) / 2) * scrollRef.current * 0.03;

      ctx.save();

      // Rounded rect clip path
      const r = 8;
      ctx.beginPath();
      ctx.roundRect(cellX + px, cellY + py, cellW, cellH, r);
      ctx.clip();

      // Draw cover image
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, cellX + px, cellY + py, cellW, cellH);
      } else {
        // Fallback: fill with dominant color
        const dom = cover.palette.dominant;
        ctx.fillStyle = `rgb(${Math.round(dom.x * 255)},${Math.round(dom.y * 255)},${Math.round(dom.z * 255)})`;
        ctx.fillRect(cellX + px, cellY + py, cellW, cellH);
      }

      // Color bleed: soft dominant-colored overlay on edges
      if (COLOR_BLEED > 0) {
        const dom = cover.palette.dominant;
        const gradient = ctx.createRadialGradient(
          cellX + px + cellW / 2, cellY + py + cellH / 2, Math.min(cellW, cellH) * 0.3,
          cellX + px + cellW / 2, cellY + py + cellH / 2, Math.max(cellW, cellH) * 0.7,
        );
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, `rgba(${Math.round(dom.x * 255)},${Math.round(dom.y * 255)},${Math.round(dom.z * 255)},${COLOR_BLEED * 0.15})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(cellX + px, cellY + py, cellW, cellH);
      }

      ctx.restore();
    }
  }

  return { canvasRef, deckPalette };
}
