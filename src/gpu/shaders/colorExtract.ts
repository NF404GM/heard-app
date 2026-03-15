/**
 * HEARD — GPU Color Extraction Compute Shader
 * Extracts a CardPalette from album art using parallel histogram reduction.
 * Input: 64×64 album art texture
 * Output: CardPaletteData with dominant, accent, shadow, muted, warmth
 */
import type { CardPaletteData } from '../types/gpu.types';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const TEXTURE_SIZE = 64;
const HUE_BUCKETS = 36; // 10° each
const WORKGROUP_SIZE = 64;
const TOP_BUCKETS = 4;

// ═══════════════════════════════════════
// WGSL Compute Shader
// ═══════════════════════════════════════

const COLOR_EXTRACT_SHADER = /* wgsl */ `
  // Output structure matching CardPalette layout
  struct CardPalette {
    dominant: vec4f,
    shadow:   vec4f,
    accent:   vec4f,
    muted:    vec4f,
    warmth:   f32,
  };

  // Per-bucket accumulator
  struct HueBucket {
    count:     atomic<u32>,
    satSum:    atomic<u32>,  // fixed-point: actual * 1000
    lightSum:  atomic<u32>,  // fixed-point: actual * 1000
    redSum:    atomic<u32>,  // fixed-point: actual * 1000
    greenSum:  atomic<u32>,
    blueSum:   atomic<u32>,
  };

  @group(0) @binding(0) var inputTexture: texture_2d<f32>;
  @group(0) @binding(1) var<storage, read_write> buckets: array<HueBucket, ${HUE_BUCKETS}>;
  @group(0) @binding(2) var<storage, read_write> result: CardPalette;
  @group(0) @binding(3) var<storage, read_write> warmCount: atomic<u32>;
  @group(0) @binding(4) var<storage, read_write> totalCount: atomic<u32>;

  // RGB → HSL conversion
  fn rgbToHsl(r: f32, g: f32, b: f32) -> vec3f {
    let cMax = max(max(r, g), b);
    let cMin = min(min(r, g), b);
    let delta = cMax - cMin;
    let l = (cMax + cMin) * 0.5;

    if (delta < 0.001) {
      return vec3f(0.0, 0.0, l);
    }

    let s = select(
      delta / (2.0 - cMax - cMin),
      delta / (cMax + cMin),
      l < 0.5
    );

    var h: f32;
    if (cMax == r) {
      h = ((g - b) / delta) % 6.0;
    } else if (cMax == g) {
      h = (b - r) / delta + 2.0;
    } else {
      h = (r - g) / delta + 4.0;
    }
    h = h * 60.0;
    if (h < 0.0) { h += 360.0; }

    return vec3f(h, s, l);
  }

  // HSL → RGB conversion
  fn hslToRgb(h: f32, s: f32, l: f32) -> vec3f {
    if (s < 0.001) {
      return vec3f(l, l, l);
    }

    let q = select(l + s - l * s, l * (1.0 + s), l < 0.5);
    let p = 2.0 * l - q;
    let hNorm = h / 360.0;

    return vec3f(
      hueToRgb(p, q, hNorm + 1.0 / 3.0),
      hueToRgb(p, q, hNorm),
      hueToRgb(p, q, hNorm - 1.0 / 3.0)
    );
  }

  fn hueToRgb(p: f32, q: f32, tIn: f32) -> f32 {
    var t = tIn;
    if (t < 0.0) { t += 1.0; }
    if (t > 1.0) { t -= 1.0; }
    if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
    if (t < 1.0 / 2.0) { return q; }
    if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
    return p;
  }

  // Phase 1: Histogram accumulation — each invocation processes one pixel
  @compute @workgroup_size(${WORKGROUP_SIZE})
  fn histogramPass(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    let totalPixels = ${TEXTURE_SIZE}u * ${TEXTURE_SIZE}u;
    if (idx >= totalPixels) { return; }

    let x = idx % ${TEXTURE_SIZE}u;
    let y = idx / ${TEXTURE_SIZE}u;
    let pixel = textureLoad(inputTexture, vec2u(x, y), 0);

    let r = pixel.r;
    let g = pixel.g;
    let b = pixel.b;

    // Skip near-black and near-white pixels
    let brightness = (r + g + b) / 3.0;
    if (brightness < 0.05 || brightness > 0.95) { return; }

    let hsl = rgbToHsl(r, g, b);
    let hue = hsl.x;
    let sat = hsl.y;
    let light = hsl.z;

    // Skip very desaturated pixels (grays)
    if (sat < 0.1) { return; }

    let bucket = u32(hue / 10.0) % ${HUE_BUCKETS}u;

    atomicAdd(&buckets[bucket].count, 1u);
    atomicAdd(&buckets[bucket].satSum, u32(sat * 1000.0));
    atomicAdd(&buckets[bucket].lightSum, u32(light * 1000.0));
    atomicAdd(&buckets[bucket].redSum, u32(r * 1000.0));
    atomicAdd(&buckets[bucket].greenSum, u32(g * 1000.0));
    atomicAdd(&buckets[bucket].blueSum, u32(b * 1000.0));

    // Warmth tracking: warm = 0°-60° and 300°-360°, cool = 60°-300°
    if (hue < 60.0 || hue >= 300.0) {
      atomicAdd(&warmCount, 1u);
    }
    atomicAdd(&totalCount, 1u);
  }

  // Phase 2: Reduce — find top 4 buckets and derive palette (single invocation)
  @compute @workgroup_size(1)
  fn reducePass() {
    // Find top 4 buckets by count
    var topIdx: array<u32, ${TOP_BUCKETS}>;
    var topCounts: array<u32, ${TOP_BUCKETS}>;
    for (var i = 0u; i < ${TOP_BUCKETS}u; i++) {
      topCounts[i] = 0u;
      topIdx[i] = 0u;
    }

    for (var b = 0u; b < ${HUE_BUCKETS}u; b++) {
      let c = atomicLoad(&buckets[b].count);
      // Insertion sort into top 4
      for (var k = 0u; k < ${TOP_BUCKETS}u; k++) {
        if (c > topCounts[k]) {
          // Shift down
          for (var j = ${TOP_BUCKETS - 1}u; j > k; j--) {
            topCounts[j] = topCounts[j - 1u];
            topIdx[j] = topIdx[j - 1u];
          }
          topCounts[k] = c;
          topIdx[k] = b;
          break;
        }
      }
    }

    // Compute average color for dominant bucket (top bucket)
    let domBucket = topIdx[0];
    let domCount = max(atomicLoad(&buckets[domBucket].count), 1u);
    let domR = f32(atomicLoad(&buckets[domBucket].redSum)) / (f32(domCount) * 1000.0);
    let domG = f32(atomicLoad(&buckets[domBucket].greenSum)) / (f32(domCount) * 1000.0);
    let domB = f32(atomicLoad(&buckets[domBucket].blueSum)) / (f32(domCount) * 1000.0);

    // Dominant: most present hue
    result.dominant = vec4f(domR, domG, domB, 1.0);

    // Find accent: bucket with highest average saturation among top 4
    var maxSat = 0.0;
    var accentIdx = 0u;
    for (var k = 0u; k < ${TOP_BUCKETS}u; k++) {
      let bk = topIdx[k];
      let cnt = max(atomicLoad(&buckets[bk].count), 1u);
      let avgSat = f32(atomicLoad(&buckets[bk].satSum)) / (f32(cnt) * 1000.0);
      if (avgSat > maxSat) {
        maxSat = avgSat;
        accentIdx = bk;
      }
    }
    let accCount = max(atomicLoad(&buckets[accentIdx].count), 1u);
    let accR = f32(atomicLoad(&buckets[accentIdx].redSum)) / (f32(accCount) * 1000.0);
    let accG = f32(atomicLoad(&buckets[accentIdx].greenSum)) / (f32(accCount) * 1000.0);
    let accB = f32(atomicLoad(&buckets[accentIdx].blueSum)) / (f32(accCount) * 1000.0);
    result.accent = vec4f(accR, accG, accB, 1.0);

    // Shadow: dominant darkened by 40%
    result.shadow = vec4f(domR * 0.6, domG * 0.6, domB * 0.6, 1.0);

    // Muted: dominant desaturated by 60%
    let domHsl = rgbToHsl(domR, domG, domB);
    let mutedSat = domHsl.y * 0.4; // 60% desaturation = 40% remaining
    let mutedRgb = hslToRgb(domHsl.x, mutedSat, domHsl.z);
    result.muted = vec4f(mutedRgb.r, mutedRgb.g, mutedRgb.b, 1.0);

    // Warmth score
    let wc = f32(atomicLoad(&warmCount));
    let tc = max(f32(atomicLoad(&totalCount)), 1.0);
    result.warmth = wc / tc;
  }
`;

// ═══════════════════════════════════════
// Pipeline Types
// ═══════════════════════════════════════

interface ColorExtractionPipeline {
  device: GPUDevice;
  histogramPipeline: GPUComputePipeline;
  reducePipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

// ═══════════════════════════════════════
// Pipeline Creation
// ═══════════════════════════════════════

export function createColorExtractionPipeline(device: GPUDevice): ColorExtractionPipeline {
  const shaderModule = device.createShaderModule({
    label: 'HEARD Color Extraction Shader',
    code: COLOR_EXTRACT_SHADER,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Color Extraction Bind Group Layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const histogramPipeline = device.createComputePipeline({
    label: 'HEARD Histogram Pass',
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'histogramPass' },
  });

  const reducePipeline = device.createComputePipeline({
    label: 'HEARD Reduce Pass',
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'reducePass' },
  });

  return { device, histogramPipeline, reducePipeline, bindGroupLayout };
}

// ═══════════════════════════════════════
// Palette Extraction
// ═══════════════════════════════════════

// Size of HueBucket: 6 × u32 = 24 bytes per bucket
const BUCKET_STRIDE = 6 * 4;
const BUCKETS_BUFFER_SIZE = HUE_BUCKETS * BUCKET_STRIDE;

// Size of CardPalette: 4 × vec4f + f32 = 4 × 16 + 4 = 68 bytes, aligned to 80
const PALETTE_BUFFER_SIZE = 80;

export async function extractPalette(
  device: GPUDevice,
  imageData: ImageData,
): Promise<CardPaletteData> {
  const pipeline = createColorExtractionPipeline(device);

  // Create 64×64 texture from ImageData
  const texture = device.createTexture({
    label: 'Album Art Input',
    size: [TEXTURE_SIZE, TEXTURE_SIZE],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  // Resize imageData to 64×64 if needed, then upload
  const resized = resizeImageData(imageData, TEXTURE_SIZE, TEXTURE_SIZE);
  device.queue.writeTexture(
    { texture },
    resized,
    { bytesPerRow: TEXTURE_SIZE * 4 },
    [TEXTURE_SIZE, TEXTURE_SIZE],
  );

  // Allocate storage buffers
  const bucketsBuffer = device.createBuffer({
    label: 'Hue Buckets',
    size: BUCKETS_BUFFER_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const paletteBuffer = device.createBuffer({
    label: 'Palette Result',
    size: PALETTE_BUFFER_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const warmCountBuffer = device.createBuffer({
    label: 'Warm Count',
    size: 4,
    usage: GPUBufferUsage.STORAGE,
  });

  const totalCountBuffer = device.createBuffer({
    label: 'Total Count',
    size: 4,
    usage: GPUBufferUsage.STORAGE,
  });

  const readbackBuffer = device.createBuffer({
    label: 'Palette Readback',
    size: PALETTE_BUFFER_SIZE,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: pipeline.bindGroupLayout,
    entries: [
      { binding: 0, resource: texture.createView() },
      { binding: 1, resource: { buffer: bucketsBuffer } },
      { binding: 2, resource: { buffer: paletteBuffer } },
      { binding: 3, resource: { buffer: warmCountBuffer } },
      { binding: 4, resource: { buffer: totalCountBuffer } },
    ],
  });

  // Encode and dispatch
  const encoder = device.createCommandEncoder({ label: 'Color Extraction' });

  // Phase 1: histogram — dispatch enough workgroups for all pixels
  const totalPixels = TEXTURE_SIZE * TEXTURE_SIZE;
  const histogramWorkgroups = Math.ceil(totalPixels / WORKGROUP_SIZE);
  const histogramPass = encoder.beginComputePass({ label: 'Histogram Pass' });
  histogramPass.setPipeline(pipeline.histogramPipeline);
  histogramPass.setBindGroup(0, bindGroup);
  histogramPass.dispatchWorkgroups(histogramWorkgroups);
  histogramPass.end();

  // Phase 2: reduce — single workgroup
  const reducePass = encoder.beginComputePass({ label: 'Reduce Pass' });
  reducePass.setPipeline(pipeline.reducePipeline);
  reducePass.setBindGroup(0, bindGroup);
  reducePass.dispatchWorkgroups(1);
  reducePass.end();

  // Copy result to readback buffer
  encoder.copyBufferToBuffer(paletteBuffer, 0, readbackBuffer, 0, PALETTE_BUFFER_SIZE);

  device.queue.submit([encoder.finish()]);

  // Read back results
  await readbackBuffer.mapAsync(GPUMapMode.READ);
  const data = new Float32Array(readbackBuffer.getMappedRange().slice(0));
  readbackBuffer.unmap();

  // Parse CardPalette from float array
  // Layout: dominant(4f) shadow(4f) accent(4f) muted(4f) warmth(1f)
  const palette: CardPaletteData = {
    dominant: { x: data[0], y: data[1], z: data[2], w: data[3] },
    shadow: { x: data[4], y: data[5], z: data[6], w: data[7] },
    accent: { x: data[8], y: data[9], z: data[10], w: data[11] },
    muted: { x: data[12], y: data[13], z: data[14], w: data[15] },
    warmth: data[16],
  };

  // Cleanup GPU resources
  texture.destroy();
  bucketsBuffer.destroy();
  paletteBuffer.destroy();
  warmCountBuffer.destroy();
  totalCountBuffer.destroy();
  readbackBuffer.destroy();

  return palette;
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

/**
 * Resize ImageData to target dimensions using nearest-neighbor sampling.
 * Returns raw RGBA Uint8Array suitable for writeTexture.
 */
function resizeImageData(src: ImageData, targetW: number, targetH: number): Uint8Array {
  if (src.width === targetW && src.height === targetH) {
    return new Uint8Array(src.data.buffer, src.data.byteOffset, src.data.byteLength);
  }

  const out = new Uint8Array(targetW * targetH * 4);
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
