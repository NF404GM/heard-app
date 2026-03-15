/**
 * HEARD — Badge Compositor Shader
 * Takes rendered card texture, iterates 8 badge slots, applies materials, blends onto card.
 *
 * Badge positions:
 *   Primary: bottom-left, 12px from edges
 *   Secondary: row to the right with 8px spacing
 *   Overflow: 3 visible + "+N" counter badge
 *
 * Each slot: sample badge shape (circle SDF), look up material by badgeId,
 * apply material shading, blend onto card with premultiplied alpha.
 */
import { ALL_BADGE_MATERIALS_WGSL } from './materials';
import {
  BADGE_MATERIAL_MAP,
  type BadgeSlotData,
  type CardPaletteData,
} from '../../types/gpu.types';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const MAX_BADGE_SLOTS = 8;
const BADGE_RADIUS_PX = 14;    // badge circle radius in pixels
const BADGE_EDGE_PX = 12;      // padding from card edge
const BADGE_SPACING_PX = 8;    // gap between badges in row
const MAX_VISIBLE = 3;         // show 3 + overflow counter

// ═══════════════════════════════════════
// WGSL — Badge Compositor Fragment Shader
// ═══════════════════════════════════════

export const badgeCompositorShader = /* wgsl */ `
  struct BadgeSlot {
    badgeId:    u32,
    position:   vec2f,   // normalized 0–1 on card surface
    scale:      f32,
    color:      vec4f,   // badge base color (from palette)
    animPhase:  f32,     // stagger offset
    visible:    u32,     // 0 or 1
  };

  struct BadgeCompositorUniforms {
    slots: array<BadgeSlot, ${MAX_BADGE_SLOTS}>,
    time:  f32,
    count: u32,
    cardWidth:  f32,
    cardHeight: f32,
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

  // ── Material functions (inlined) ──
  ${ALL_BADGE_MATERIALS_WGSL}

  @group(0) @binding(0) var<uniform> u: BadgeCompositorUniforms;
  @group(0) @binding(1) var cardTexture: texture_2d<f32>;
  @group(0) @binding(2) var cardSampler: sampler;

  // Circle SDF for badge shape
  fn badgeCircleSDF(pixelPos: vec2f, center: vec2f, radius: f32) -> f32 {
    return length(pixelPos - center) - radius;
  }

  // Badge-local UV: remap pixel position to 0–1 within badge circle
  fn badgeUV(pixelPos: vec2f, center: vec2f, radius: f32) -> vec2f {
    return (pixelPos - center + vec2f(radius)) / (2.0 * radius);
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    // Sample the underlying card texture
    var result = textureSample(cardTexture, cardSampler, input.uv);

    let pixelPos = input.uv * vec2f(u.cardWidth, u.cardHeight);

    // Iterate badge slots and composite visible badges
    let visibleCount = min(u.count, ${MAX_BADGE_SLOTS}u);
    for (var i = 0u; i < visibleCount; i++) {
      let slot = u.slots[i];
      if (slot.visible == 0u) { continue; }

      // Badge center in pixel coordinates
      let center = slot.position * vec2f(u.cardWidth, u.cardHeight);
      let radius = ${BADGE_RADIUS_PX}.0 * slot.scale;

      // Circle SDF test
      let dist = badgeCircleSDF(pixelPos, center, radius);

      // Only shade pixels inside or on the edge of the badge
      if (dist > 1.0) { continue; }

      // Anti-aliased edge
      let edgeMask = smoothstep(1.0, -1.0, dist);

      // Badge-local UV for material shading
      let bUV = badgeUV(pixelPos, center, radius);

      // Lookup material for this badge and apply material shading
      let materialId = slot.badgeId; // materialId derived from badgeId in TS, passed through
      let staggeredTime = u.time + slot.animPhase;
      let shadedColor = applyBadgeMaterial(materialId, bUV, slot.color, staggeredTime);

      // Premultiplied alpha blend
      let badgeAlpha = shadedColor.a * edgeMask;
      result = vec4f(
        mix(result.rgb, shadedColor.rgb, badgeAlpha),
        max(result.a, badgeAlpha)
      );
    }

    return result;
  }
`;

// ═══════════════════════════════════════
// Overflow counter badge WGSL
// ═══════════════════════════════════════

const OVERFLOW_COUNTER_WGSL = /* wgsl */ `
  // Render "+N" as a simple filled circle with a number hint
  // The actual text rendering is handled in the React layer;
  // GPU just provides the circle background
  fn overflowCircle(dist: f32, baseColor: vec4f) -> vec4f {
    let mask = smoothstep(1.0, -1.0, dist);
    return vec4f(baseColor.rgb * 0.6, baseColor.a * mask * 0.8);
  }
`;

// ═══════════════════════════════════════
// Pipeline Creation
// ═══════════════════════════════════════

// BadgeSlot: u32 + 2×f32(pad to 16) + f32 + vec4f + f32 + u32 = need to compute
// Practical: align each BadgeSlot to 48 bytes (12 × f32 equivalent)
// slot: badgeId(u32) + pad(4) + position(vec2f,8) + scale(f32,4) + pad(4) + color(vec4f,16) + animPhase(f32,4) + visible(u32,4) = 48 bytes
const BADGE_SLOT_SIZE = 48;
const UNIFORMS_SIZE = MAX_BADGE_SLOTS * BADGE_SLOT_SIZE + 16; // slots + time(4) + count(4) + cardWidth(4) + cardHeight(4)

export interface BadgeCompositorResources {
  device: GPUDevice;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroupLayout: GPUBindGroupLayout;
}

export function createBadgeCompositorPipeline(device: GPUDevice): BadgeCompositorResources {
  const module = device.createShaderModule({
    label: 'HEARD Badge Compositor',
    code: badgeCompositorShader,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Badge Compositor BGL',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const uniformBuffer = device.createBuffer({
    label: 'Badge Compositor Uniforms',
    size: UNIFORMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const pipeline = device.createRenderPipeline({
    label: 'HEARD Badge Compositor Pipeline',
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
 * Create a bind group for a specific card texture.
 * Called when the card texture changes (e.g. new card rendered).
 */
export function createBadgeBindGroup(
  resources: BadgeCompositorResources,
  cardTextureView: GPUTextureView,
): GPUBindGroup {
  const sampler = resources.device.createSampler({
    label: 'Badge Card Sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  return resources.device.createBindGroup({
    layout: resources.bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: resources.uniformBuffer } },
      { binding: 1, resource: cardTextureView },
      { binding: 2, resource: sampler },
    ],
  });
}

// ═══════════════════════════════════════
// Badge Layout — Position Calculation
// ═══════════════════════════════════════

export interface BadgeLayoutSlot {
  position: { x: number; y: number }; // normalized 0–1
  isOverflow: boolean;
  overflowCount: number;
}

/**
 * Compute badge layout positions on card surface.
 * Primary: bottom-left 12px from edges.
 * Secondary: row to the right with 8px spacing.
 * Max 3 visible + overflow counter.
 */
export function computeBadgeLayout(
  badgeCount: number,
  cardWidth: number,
  cardHeight: number,
): BadgeLayoutSlot[] {
  const slots: BadgeLayoutSlot[] = [];
  const visible = Math.min(badgeCount, MAX_VISIBLE);
  const hasOverflow = badgeCount > MAX_VISIBLE;

  for (let i = 0; i < visible; i++) {
    const px = BADGE_EDGE_PX + BADGE_RADIUS_PX + i * (BADGE_RADIUS_PX * 2 + BADGE_SPACING_PX);
    const py = cardHeight - BADGE_EDGE_PX - BADGE_RADIUS_PX;

    slots.push({
      position: { x: px / cardWidth, y: py / cardHeight },
      isOverflow: false,
      overflowCount: 0,
    });
  }

  // Overflow "+N" counter badge
  if (hasOverflow) {
    const overflowIdx = visible;
    const px = BADGE_EDGE_PX + BADGE_RADIUS_PX + overflowIdx * (BADGE_RADIUS_PX * 2 + BADGE_SPACING_PX);
    const py = cardHeight - BADGE_EDGE_PX - BADGE_RADIUS_PX;

    slots.push({
      position: { x: px / cardWidth, y: py / cardHeight },
      isOverflow: true,
      overflowCount: badgeCount - MAX_VISIBLE,
    });
  }

  return slots;
}

/**
 * Write badge compositor uniforms to the GPU buffer.
 * Maps BadgeSlotData[] to the uniform struct layout.
 */
export function writeBadgeCompositorUniforms(
  device: GPUDevice,
  buffer: GPUBuffer,
  slots: BadgeSlotData[],
  time: number,
  cardWidth: number,
  cardHeight: number,
): void {
  const data = new ArrayBuffer(UNIFORMS_SIZE);
  const floats = new Float32Array(data);
  const uints = new Uint32Array(data);

  for (let i = 0; i < MAX_BADGE_SLOTS; i++) {
    const baseOffset = i * (BADGE_SLOT_SIZE / 4); // in 32-bit words
    const slot = i < slots.length ? slots[i] : null;

    if (slot) {
      // badgeId: u32
      uints[baseOffset + 0] = slot.badgeId;
      // padding
      floats[baseOffset + 1] = 0;
      // position: vec2f
      floats[baseOffset + 2] = slot.position.x;
      floats[baseOffset + 3] = slot.position.y;
      // scale: f32
      floats[baseOffset + 4] = slot.scale;
      // padding
      floats[baseOffset + 5] = 0;
      floats[baseOffset + 6] = 0;
      floats[baseOffset + 7] = 0;
      // color: vec4f (aligned to 16 bytes)
      floats[baseOffset + 8] = slot.color.x;
      floats[baseOffset + 9] = slot.color.y;
      floats[baseOffset + 10] = slot.color.z;
      floats[baseOffset + 11] = slot.color.w;
    } else {
      // Zero out empty slots
      for (let j = 0; j < BADGE_SLOT_SIZE / 4; j++) {
        uints[baseOffset + j] = 0;
      }
    }
  }

  // After all slots: time, count, cardWidth, cardHeight
  const tailOffset = MAX_BADGE_SLOTS * (BADGE_SLOT_SIZE / 4);
  floats[tailOffset + 0] = time;
  uints[tailOffset + 1] = Math.min(slots.length, MAX_BADGE_SLOTS);
  floats[tailOffset + 2] = cardWidth;
  floats[tailOffset + 3] = cardHeight;

  device.queue.writeBuffer(buffer, 0, data);
}
