/**
 * HEARD — Deck Mosaic Compositor
 * GPU-composited mosaic of card cover art thumbnails for deck/collection views.
 *
 * Features:
 *   - Grid layouts (2×2, 3×3, 4×4) with configurable gap
 *   - Parallax offset on scroll
 *   - Color bleed: dominant colors from each card "leak" softly into neighbors
 *   - Rounded corners on each cell
 *   - Aggregate deck palette derived from visible cards
 *
 * Fragment shader samples cover textures, applies parallax, blends color bleed.
 */
import type { CardPaletteData } from '../../types/gpu.types';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const MAX_CELLS = 16;       // 4×4 max grid
const CELL_CORNER_RADIUS = 8; // px

// ═══════════════════════════════════════
// WGSL — Mosaic Fragment Shader
// ═══════════════════════════════════════

export const deckMosaicShader = /* wgsl */ `
  struct CellData {
    // UV rect in the texture atlas (x, y, w, h)
    uvRect:     vec4f,
    // Dominant color of this cell's card (for color bleed)
    dominant:   vec4f,
    // Grid position (col, row) and parallax offset
    gridPos:    vec2f,
    parallaxX:  f32,
    parallaxY:  f32,
  };

  struct MosaicUniforms {
    cells:         array<CellData, ${MAX_CELLS}>,
    cellCount:     u32,
    gridCols:      u32,
    gridRows:      u32,
    mosaicWidth:   f32,
    mosaicHeight:  f32,
    gapPx:         f32,
    scrollOffset:  f32,
    colorBleed:    f32,  // 0.0–1.0 bleed strength
  };

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
  };

  @vertex
  fn vertexMain(@builtin(vertex_index) idx: u32) -> VertexOutput {
    var positions = array<vec2f, 6>(
      vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
      vec2f(-1.0,  1.0), vec2f(1.0, -1.0), vec2f( 1.0, 1.0)
    );
    var uvs = array<vec2f, 6>(
      vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
      vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0)
    );

    var out: VertexOutput;
    out.position = vec4f(positions[idx], 0.0, 1.0);
    out.uv = uvs[idx];
    return out;
  }

  @group(0) @binding(0) var<uniform> u: MosaicUniforms;
  @group(0) @binding(1) var atlasTexture: texture_2d<f32>;
  @group(0) @binding(2) var atlasSampler: sampler;

  // Rounded rect SDF for cell masking
  fn cellRoundedRect(p: vec2f, halfSize: vec2f, radius: f32) -> f32 {
    let d = abs(p) - halfSize + vec2f(radius);
    return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0) - radius;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let pixelPos = input.uv * vec2f(u.mosaicWidth, u.mosaicHeight);

    // Cell dimensions
    let cellW = (u.mosaicWidth - u.gapPx * (f32(u.gridCols) + 1.0)) / f32(u.gridCols);
    let cellH = (u.mosaicHeight - u.gapPx * (f32(u.gridRows) + 1.0)) / f32(u.gridRows);

    var resultColor = vec4f(0.0);
    var bleedAccum = vec3f(0.0);
    var bleedWeight = 0.0;

    for (var i = 0u; i < u.cellCount; i++) {
      let cell = u.cells[i];

      // Cell top-left corner in pixels
      let cellX = u.gapPx + cell.gridPos.x * (cellW + u.gapPx);
      let cellY = u.gapPx + cell.gridPos.y * (cellH + u.gapPx);
      let cellCenter = vec2f(cellX + cellW * 0.5, cellY + cellH * 0.5);

      // Parallax: shift cell position based on scroll
      let parallax = vec2f(
        cell.parallaxX * u.scrollOffset * 0.03,
        cell.parallaxY * u.scrollOffset * 0.03
      );

      let adjustedPos = pixelPos - parallax;

      // Distance from cell center
      let localPos = adjustedPos - cellCenter;
      let halfCell = vec2f(cellW, cellH) * 0.5;

      // Rounded rect SDF
      let sdf = cellRoundedRect(localPos, halfCell, ${CELL_CORNER_RADIUS}.0);

      // Inside cell: sample cover art texture from atlas
      if (sdf < 0.5) {
        let edgeMask = smoothstep(0.5, -0.5, sdf);

        // Local UV within cell (0–1)
        let localUV = (localPos + halfCell) / vec2f(cellW, cellH);
        // Clamp to cell bounds
        let clampedUV = clamp(localUV, vec2f(0.0), vec2f(1.0));

        // Map to atlas UV rect
        let atlasUV = cell.uvRect.xy + clampedUV * cell.uvRect.zw;
        let texColor = textureSample(atlasTexture, atlasSampler, atlasUV);

        resultColor = vec4f(texColor.rgb, texColor.a * edgeMask);
      }

      // Color bleed: accumulate dominant colors weighted by proximity
      let distFromCell = max(sdf, 0.0);
      let bleedFalloff = smoothstep(cellW * 0.5, 0.0, distFromCell);
      if (bleedFalloff > 0.001) {
        bleedAccum += cell.dominant.rgb * bleedFalloff;
        bleedWeight += bleedFalloff;
      }
    }

    // Apply color bleed
    if (bleedWeight > 0.001 && u.colorBleed > 0.0) {
      let bleedColor = bleedAccum / bleedWeight;
      let bleedAlpha = min(bleedWeight * u.colorBleed * 0.15, 0.2);

      // Blend behind the cell content
      if (resultColor.a < 0.5) {
        resultColor = vec4f(bleedColor, bleedAlpha);
      } else {
        // Tint the cell slightly
        resultColor = vec4f(
          mix(resultColor.rgb, bleedColor, u.colorBleed * 0.1),
          resultColor.a
        );
      }
    }

    return resultColor;
  }
`;

// ═══════════════════════════════════════
// Pipeline Creation
// ═══════════════════════════════════════

// CellData: vec4f + vec4f + vec2f + f32 + f32 = 16+16+8+4+4 = 48 bytes per cell
const CELL_DATA_SIZE = 48;
// MosaicUniforms: cells + trailing scalars
// cells: 16 × 48 = 768
// scalars: u32 + u32 + u32 + f32 + f32 + f32 + f32 + f32 = 32 bytes
const UNIFORMS_SIZE = MAX_CELLS * CELL_DATA_SIZE + 32;

export interface DeckMosaicResources {
  device: GPUDevice;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroupLayout: GPUBindGroupLayout;
}

export function createDeckMosaicPipeline(device: GPUDevice): DeckMosaicResources {
  const module = device.createShaderModule({
    label: 'HEARD Deck Mosaic',
    code: deckMosaicShader,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Deck Mosaic BGL',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const uniformBuffer = device.createBuffer({
    label: 'Deck Mosaic Uniforms',
    size: UNIFORMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const pipeline = device.createRenderPipeline({
    label: 'HEARD Deck Mosaic Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module, entryPoint: 'vertexMain' },
    fragment: {
      module,
      entryPoint: 'fragmentMain',
      targets: [{
        format: 'bgra8unorm',
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list' },
  });

  return { device, pipeline, uniformBuffer, bindGroupLayout };
}

/**
 * Create a bind group for a specific atlas texture.
 * Call when the cover art atlas is created or updated.
 */
export function createMosaicBindGroup(
  resources: DeckMosaicResources,
  atlasTextureView: GPUTextureView,
): GPUBindGroup {
  const sampler = resources.device.createSampler({
    label: 'Mosaic Atlas Sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
  });

  return resources.device.createBindGroup({
    layout: resources.bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: resources.uniformBuffer } },
      { binding: 1, resource: atlasTextureView },
      { binding: 2, resource: sampler },
    ],
  });
}

// ═══════════════════════════════════════
// Types for cell configuration
// ═══════════════════════════════════════

export interface MosaicCell {
  /** UV rect in atlas: [x, y, width, height] normalized 0–1 */
  uvRect: { x: number; y: number; z: number; w: number };
  /** Dominant color from card palette */
  dominant: { x: number; y: number; z: number; w: number };
  /** Grid column (0-based) */
  col: number;
  /** Grid row (0-based) */
  row: number;
  /** Parallax multipliers */
  parallaxX: number;
  parallaxY: number;
}

/**
 * Write mosaic uniforms to the GPU buffer.
 */
export function writeMosaicUniforms(
  device: GPUDevice,
  buffer: GPUBuffer,
  cells: MosaicCell[],
  gridCols: number,
  gridRows: number,
  mosaicWidth: number,
  mosaicHeight: number,
  gapPx: number,
  scrollOffset: number,
  colorBleed: number,
): void {
  const data = new ArrayBuffer(UNIFORMS_SIZE);
  const floats = new Float32Array(data);
  const uints = new Uint32Array(data);

  for (let i = 0; i < MAX_CELLS; i++) {
    const base = i * (CELL_DATA_SIZE / 4);
    const cell = i < cells.length ? cells[i] : null;

    if (cell) {
      // uvRect: vec4f
      floats[base + 0] = cell.uvRect.x;
      floats[base + 1] = cell.uvRect.y;
      floats[base + 2] = cell.uvRect.z;
      floats[base + 3] = cell.uvRect.w;
      // dominant: vec4f
      floats[base + 4] = cell.dominant.x;
      floats[base + 5] = cell.dominant.y;
      floats[base + 6] = cell.dominant.z;
      floats[base + 7] = cell.dominant.w;
      // gridPos: vec2f
      floats[base + 8] = cell.col;
      floats[base + 9] = cell.row;
      // parallax
      floats[base + 10] = cell.parallaxX;
      floats[base + 11] = cell.parallaxY;
    } else {
      for (let j = 0; j < CELL_DATA_SIZE / 4; j++) {
        floats[base + j] = 0;
      }
    }
  }

  // Trailing scalars
  const tail = MAX_CELLS * (CELL_DATA_SIZE / 4);
  uints[tail + 0] = Math.min(cells.length, MAX_CELLS);
  uints[tail + 1] = gridCols;
  uints[tail + 2] = gridRows;
  floats[tail + 3] = mosaicWidth;
  floats[tail + 4] = mosaicHeight;
  floats[tail + 5] = gapPx;
  floats[tail + 6] = scrollOffset;
  floats[tail + 7] = colorBleed;

  device.queue.writeBuffer(buffer, 0, data);
}

// ═══════════════════════════════════════
// Deck Palette Derivation
// ═══════════════════════════════════════

/**
 * Derive an aggregate palette from multiple card palettes.
 * Used for deck-level color theming.
 * Averages dominant/accent/muted across all cards, picks most saturated accent.
 */
export function deriveDeckPalette(palettes: CardPaletteData[]): CardPaletteData | null {
  if (palettes.length === 0) return null;

  const avgDominant = { x: 0, y: 0, z: 0, w: 1 };
  const avgShadow = { x: 0, y: 0, z: 0, w: 1 };
  const avgMuted = { x: 0, y: 0, z: 0, w: 1 };
  let avgWarmth = 0;

  // Track most saturated accent
  let bestAccent = palettes[0].accent;
  let bestSaturation = 0;

  for (const p of palettes) {
    avgDominant.x += p.dominant.x;
    avgDominant.y += p.dominant.y;
    avgDominant.z += p.dominant.z;

    avgShadow.x += p.shadow.x;
    avgShadow.y += p.shadow.y;
    avgShadow.z += p.shadow.z;

    avgMuted.x += p.muted.x;
    avgMuted.y += p.muted.y;
    avgMuted.z += p.muted.z;

    avgWarmth += p.warmth;

    // Saturation approximation: max - min of RGB
    const sat = Math.max(p.accent.x, p.accent.y, p.accent.z) -
                Math.min(p.accent.x, p.accent.y, p.accent.z);
    if (sat > bestSaturation) {
      bestSaturation = sat;
      bestAccent = p.accent;
    }
  }

  const n = palettes.length;
  return {
    dominant: { x: avgDominant.x / n, y: avgDominant.y / n, z: avgDominant.z / n, w: 1 } as CardPaletteData['dominant'],
    shadow: { x: avgShadow.x / n, y: avgShadow.y / n, z: avgShadow.z / n, w: 1 } as CardPaletteData['shadow'],
    accent: bestAccent,
    muted: { x: avgMuted.x / n, y: avgMuted.y / n, z: avgMuted.z / n, w: 1 } as CardPaletteData['muted'],
    warmth: avgWarmth / n,
  };
}
