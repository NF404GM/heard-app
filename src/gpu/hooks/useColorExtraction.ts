/**
 * HEARD — useColorExtraction Hook
 * Extracts a CardPalette from an album art URL.
 * Uses GPU compute shader when available, falls back to CPU.
 * Results are cached by URL to avoid re-extraction.
 */
import { useState, useEffect, useRef } from 'react';
import { useGPUContext } from '../context';
import { extractPalette } from '../shaders/colorExtract';
import { extractPaletteCPU } from '../fallbacks/cpuColorExtract';
import type { CardPaletteData } from '../types/gpu.types';

// ═══════════════════════════════════════
// Cache — persists across hook instances
// ═══════════════════════════════════════

const paletteCache = new Map<string, CardPaletteData>();

// ═══════════════════════════════════════
// Image Loading Utility
// ═══════════════════════════════════════

function loadImageData(url: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
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

export function useColorExtraction(imageUrl: string | null): UseColorExtractionResult {
  const [palette, setPalette] = useState<CardPaletteData | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const { device, isAvailable } = useGPUContext();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
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

    // Abort any in-flight extraction
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsExtracting(true);

    async function extract() {
      try {
        const imageData = await loadImageData(imageUrl!);

        if (controller.signal.aborted) return;

        let result: CardPaletteData;

        if (isAvailable && device) {
          // GPU path
          try {
            result = await extractPalette(device, imageData);
          } catch (gpuError) {
            console.warn('[HEARD Color] GPU extraction failed, falling back to CPU:', gpuError);
            result = extractPaletteCPU(imageData);
          }
        } else {
          // CPU fallback
          result = extractPaletteCPU(imageData);
        }

        if (controller.signal.aborted) return;

        // Cache the result
        paletteCache.set(imageUrl!, result);
        setPalette(result);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('[HEARD Color] Extraction failed:', error);
          setPalette(null);
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
  }, [imageUrl, device, isAvailable]);

  return { palette, isExtracting };
}
