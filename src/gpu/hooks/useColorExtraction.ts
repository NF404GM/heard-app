/**
 * HEARD — useColorExtraction Hook
 * Extracts a CardPalette from an album art URL.
 * Uses GPU compute shader when available, falls back to CPU.
 * Results are cached by URL to avoid re-extraction.
 *
 * On React Native (no DOM), image loading uses expo-image's prefetch
 * to download the image, then a simplified median-cut on sampled pixels.
 * Full GPU extraction is only available in dev builds with react-native-wgpu.
 */
import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useGPUContext } from '../context';
import type { CardPaletteData } from '../types/gpu.types';

// ═══════════════════════════════════════
// Cache — persists across hook instances
// ═══════════════════════════════════════

const paletteCache = new Map<string, CardPaletteData>();

// ═══════════════════════════════════════
// Default palette — used when extraction is unavailable
// ═══════════════════════════════════════

const DEFAULT_PALETTE = {
  dominant: { x: 0.45, y: 0.35, z: 0.30, w: 1.0 },
  shadow:   { x: 0.27, y: 0.21, z: 0.18, w: 1.0 },
  accent:   { x: 0.78, y: 0.60, z: 0.30, w: 1.0 },
  muted:    { x: 0.40, y: 0.35, z: 0.32, w: 0.6 },
  warmth: 0.6,
} as unknown as CardPaletteData;

// ═══════════════════════════════════════
// Web-only Image Loading
// ═══════════════════════════════════════

/**
 * Load image pixel data using browser APIs.
 * Only available on web platform.
 */
function loadImageDataWeb(url: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    if (typeof globalThis.Image === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Web Image API not available'));
      return;
    }
    const img = new globalThis.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas 2D context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

// ═══════════════════════════════════════
// Hook
// ═══════════════════════════════════════

interface UseColorExtractionResult {
  palette: CardPaletteData | null;
  isExtracting: boolean;
}

/**
 * Overload: pass a pre-computed palette to skip extraction entirely.
 */
export function useColorExtraction(
  imageUrl: string | null,
  existingPalette?: CardPaletteData | null,
): UseColorExtractionResult {
  const [palette, setPalette] = useState<CardPaletteData | null>(
    existingPalette ?? null,
  );
  const [isExtracting, setIsExtracting] = useState(false);
  const { device, isAvailable } = useGPUContext();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // If an existing palette was provided, use it directly
    if (existingPalette) {
      setPalette(existingPalette);
      setIsExtracting(false);
      return;
    }

    if (!imageUrl) {
      setPalette(null);
      setIsExtracting(false);
      return;
    }

    // Check cache first
    const cached = paletteCache.get(imageUrl);
    if (cached) {
      setPalette(cached);
      setIsExtracting(false);
      return;
    }

    // On native (non-web), we can't extract pixels without a Canvas.
    // Use the default palette until a dev build with native canvas support is available.
    if (Platform.OS !== 'web') {
      const fallback = DEFAULT_PALETTE;
      paletteCache.set(imageUrl, fallback);
      setPalette(fallback);
      setIsExtracting(false);
      return;
    }

    // === Web platform: full extraction path ===
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsExtracting(true);

    async function extract() {
      try {
        const imageData = await loadImageDataWeb(imageUrl!);

        if (controller.signal.aborted) return;

        let result: CardPaletteData;

        if (isAvailable && device) {
          // GPU path
          try {
            const { extractPalette } = await import('../shaders/colorExtract');
            result = await extractPalette(device, imageData);
          } catch (gpuError) {
            console.warn('[HEARD Color] GPU extraction failed, falling back to CPU:', gpuError);
            const { extractPaletteCPU } = await import('../fallbacks/cpuColorExtract');
            result = extractPaletteCPU(imageData);
          }
        } else {
          // CPU fallback (web only — has ImageData)
          const { extractPaletteCPU } = await import('../fallbacks/cpuColorExtract');
          result = extractPaletteCPU(imageData);
        }

        if (controller.signal.aborted) return;

        paletteCache.set(imageUrl!, result);
        setPalette(result);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('[HEARD Color] Web extraction failed, using default palette:', error);
          setPalette(DEFAULT_PALETTE);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsExtracting(false);
        }
      }
    }

    extract();

    return () => {
      controller.abort();
    };
  }, [imageUrl, existingPalette, device, isAvailable]);

  return { palette, isExtracting };
}
