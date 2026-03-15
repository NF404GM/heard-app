/**
 * HEARD — CPU Color Extraction Fallback
 * Same histogram-based algorithm as the GPU compute shader,
 * implemented in plain TypeScript for devices without WebGPU.
 * Produces identical output to the GPU version.
 */
import type { CardPaletteData } from '../types/gpu.types';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const HUE_BUCKETS = 36; // 10° each
const TOP_BUCKETS = 4;
const TEXTURE_SIZE = 64;

// ═══════════════════════════════════════
// HSL Conversion Utilities
// ═══════════════════════════════════════

interface HSL {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  const cMax = Math.max(r, g, b);
  const cMin = Math.min(r, g, b);
  const delta = cMax - cMin;
  const l = (cMax + cMin) * 0.5;

  if (delta < 0.001) {
    return { h: 0, s: 0, l };
  }

  const s = l < 0.5 ? delta / (cMax + cMin) : delta / (2.0 - cMax - cMin);

  let h: number;
  if (cMax === r) {
    h = ((g - b) / delta) % 6.0;
  } else if (cMax === g) {
    h = (b - r) / delta + 2.0;
  } else {
    h = (r - g) / delta + 4.0;
  }
  h *= 60.0;
  if (h < 0) h += 360.0;

  return { h, s, l };
}

function hueToRgb(p: number, q: number, tIn: number): number {
  let t = tIn;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s < 0.001) {
    return [l, l, l];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hNorm = h / 360;

  return [
    hueToRgb(p, q, hNorm + 1 / 3),
    hueToRgb(p, q, hNorm),
    hueToRgb(p, q, hNorm - 1 / 3),
  ];
}

// ═══════════════════════════════════════
// Histogram Bucket
// ═══════════════════════════════════════

interface HueBucket {
  count: number;
  satSum: number;
  lightSum: number;
  redSum: number;
  greenSum: number;
  blueSum: number;
}

function createEmptyBucket(): HueBucket {
  return { count: 0, satSum: 0, lightSum: 0, redSum: 0, greenSum: 0, blueSum: 0 };
}

// ═══════════════════════════════════════
// CPU Palette Extraction
// ═══════════════════════════════════════

/**
 * Extract a CardPalette from image data using CPU-based histogram analysis.
 * Mirrors the GPU compute shader algorithm exactly.
 */
export function extractPaletteCPU(imageData: ImageData): CardPaletteData {
  // Resize to 64×64 for consistent processing
  const pixels = resizeToTarget(imageData, TEXTURE_SIZE, TEXTURE_SIZE);

  // Phase 1: Build histogram buckets
  const buckets: HueBucket[] = Array.from({ length: HUE_BUCKETS }, createEmptyBucket);
  let warmCount = 0;
  let totalCount = 0;

  const totalPixels = TEXTURE_SIZE * TEXTURE_SIZE;
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = pixels[idx] / 255;
    const g = pixels[idx + 1] / 255;
    const b = pixels[idx + 2] / 255;

    // Skip near-black and near-white pixels
    const brightness = (r + g + b) / 3;
    if (brightness < 0.05 || brightness > 0.95) continue;

    const hsl = rgbToHsl(r, g, b);

    // Skip very desaturated pixels (grays)
    if (hsl.s < 0.1) continue;

    const bucketIdx = Math.min(Math.floor(hsl.h / 10), HUE_BUCKETS - 1);
    const bucket = buckets[bucketIdx];

    bucket.count++;
    bucket.satSum += hsl.s;
    bucket.lightSum += hsl.l;
    bucket.redSum += r;
    bucket.greenSum += g;
    bucket.blueSum += b;

    // Warmth tracking: warm = 0°-60° and 300°-360°, cool = 60°-300°
    if (hsl.h < 60 || hsl.h >= 300) {
      warmCount++;
    }
    totalCount++;
  }

  // Phase 2: Find top 4 buckets by count
  const topIndices: number[] = [];
  const topCounts: number[] = [];
  for (let i = 0; i < TOP_BUCKETS; i++) {
    topIndices.push(0);
    topCounts.push(0);
  }

  for (let b = 0; b < HUE_BUCKETS; b++) {
    const c = buckets[b].count;
    for (let k = 0; k < TOP_BUCKETS; k++) {
      if (c > topCounts[k]) {
        // Shift down
        for (let j = TOP_BUCKETS - 1; j > k; j--) {
          topCounts[j] = topCounts[j - 1];
          topIndices[j] = topIndices[j - 1];
        }
        topCounts[k] = c;
        topIndices[k] = b;
        break;
      }
    }
  }

  // Dominant: average color from most popular bucket
  const domBucket = buckets[topIndices[0]];
  const domCount = Math.max(domBucket.count, 1);
  const domR = domBucket.redSum / domCount;
  const domG = domBucket.greenSum / domCount;
  const domB = domBucket.blueSum / domCount;

  // Accent: bucket with highest average saturation among top 4
  let maxSat = 0;
  let accentBucketIdx = 0;
  for (let k = 0; k < TOP_BUCKETS; k++) {
    const bk = buckets[topIndices[k]];
    const cnt = Math.max(bk.count, 1);
    const avgSat = bk.satSum / cnt;
    if (avgSat > maxSat) {
      maxSat = avgSat;
      accentBucketIdx = topIndices[k];
    }
  }
  const accBucket = buckets[accentBucketIdx];
  const accCount = Math.max(accBucket.count, 1);
  const accR = accBucket.redSum / accCount;
  const accG = accBucket.greenSum / accCount;
  const accB = accBucket.blueSum / accCount;

  // Shadow: dominant darkened by 40%
  const shadowR = domR * 0.6;
  const shadowG = domG * 0.6;
  const shadowB = domB * 0.6;

  // Muted: dominant desaturated by 60%
  const domHsl = rgbToHsl(domR, domG, domB);
  const mutedSat = domHsl.s * 0.4; // 60% desaturation = 40% remaining
  const [mutedR, mutedG, mutedB] = hslToRgb(domHsl.h, mutedSat, domHsl.l);

  // Warmth score
  const warmth = totalCount > 0 ? warmCount / totalCount : 0.5;

  return {
    dominant: { x: domR, y: domG, z: domB, w: 1.0 } as CardPaletteData['dominant'],
    shadow: { x: shadowR, y: shadowG, z: shadowB, w: 1.0 } as CardPaletteData['shadow'],
    accent: { x: accR, y: accG, z: accB, w: 1.0 } as CardPaletteData['accent'],
    muted: { x: mutedR, y: mutedG, z: mutedB, w: 1.0 } as CardPaletteData['muted'],
    warmth,
  };
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

/**
 * Resize image data to target dimensions using nearest-neighbor sampling.
 * Returns raw RGBA Uint8ClampedArray.
 */
function resizeToTarget(src: ImageData, targetW: number, targetH: number): Uint8ClampedArray {
  if (src.width === targetW && src.height === targetH) {
    return src.data;
  }

  const out = new Uint8ClampedArray(targetW * targetH * 4);
  const xRatio = src.width / targetW;
  const yRatio = src.height / targetH;

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.floor(x * xRatio);
      const srcY = Math.floor(y * yRatio);
      const srcIdx = (srcY * src.width + srcX) * 4;
      const dstIdx = (y * targetW + x) * 4;
      out[dstIdx] = src.data[srcIdx];
      out[dstIdx + 1] = src.data[srcIdx + 1];
      out[dstIdx + 2] = src.data[srcIdx + 2];
      out[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }

  return out;
}
