/**
 * HEARD — Tier 0: COMMON Frame Shader
 * Solid border using dominant palette color.
 * No animation — static render.
 * 2px border width, 12px corner radius.
 */
import type { CardPaletteData } from '../../types/gpu.types';

// ═══════════════════════════════════════
// Shared WGSL structs used by all frame tiers
// ═══════════════════════════════════════

export const FRAME_STRUCTS_WGSL = /* wgsl */ `
  struct CardPalette {
    dominant: vec4f,
    shadow:   vec4f,
    accent:   vec4f,
    muted:    vec4f,
    warmth:   f32,
  };

  struct FrameUniforms {
    dominant:    vec4f,
    shadow:      vec4f,
    accent:      vec4f,
    muted:       vec4f,
    warmth:      f32,
    time:        f32,
    tier:        u32,
    intensity:   f32,
    cardWidth:   f32,
    cardHeight:  f32,
    borderWidth: f32,
    _pad:        f32,
  };

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
  };

  // Full-screen quad vertex shader — shared across all tiers
  @vertex
  fn vertexMain(@builtin(vertex_index) idx: u32) -> VertexOutput {
    // Two-triangle fullscreen quad
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

  // Rounded rectangle SDF — core primitive for all frames
  fn roundedRectSDF(uv: vec2f, halfSize: vec2f, radius: f32) -> f32 {
    let d = abs(uv) - halfSize + vec2f(radius);
    return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0) - radius;
  }
`;

// ═══════════════════════════════════════
// Common Frame Fragment Shader
// ═══════════════════════════════════════

export const commonFrameShader = /* wgsl */ `
  ${FRAME_STRUCTS_WGSL}

  @group(0) @binding(0) var<uniform> u: FrameUniforms;

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let pixelCoord = input.uv * vec2f(u.cardWidth, u.cardHeight);
    let center = vec2f(u.cardWidth, u.cardHeight) * 0.5;
    let p = pixelCoord - center;
    let halfSize = center;
    let radius = 12.0;

    // Distance from edge of rounded rect
    let outerDist = roundedRectSDF(p, halfSize, radius);
    let innerDist = roundedRectSDF(p, halfSize - vec2f(u.borderWidth), max(radius - u.borderWidth, 0.0));

    // Border: between outer and inner SDF
    let borderMask = smoothstep(-0.5, 0.5, -outerDist) * smoothstep(-0.5, 0.5, innerDist);

    // Solid dominant color
    let borderColor = u.dominant;

    return vec4f(borderColor.rgb, borderColor.a * borderMask);
  }
`;

// ═══════════════════════════════════════
// Pipeline Creation
// ═══════════════════════════════════════

// Uniform buffer layout: 4×vec4f + 8×f32 = 64 + 32 = 96 bytes
const UNIFORM_SIZE = 96;

export interface FramePipelineResources {
  device: GPUDevice;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
}

export function createCommonFramePipeline(device: GPUDevice): FramePipelineResources {
  const module = device.createShaderModule({
    label: 'HEARD Common Frame',
    code: commonFrameShader,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Frame Bind Group Layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const uniformBuffer = device.createBuffer({
    label: 'Frame Uniforms',
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'HEARD Common Frame Pipeline',
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

  return { device, pipeline, uniformBuffer, bindGroup };
}

/**
 * Write palette + frame uniforms to the GPU uniform buffer.
 * Shared by all frame tiers.
 */
export function writeFrameUniforms(
  device: GPUDevice,
  buffer: GPUBuffer,
  palette: CardPaletteData,
  time: number,
  tier: number,
  intensity: number,
  cardWidth: number,
  cardHeight: number,
  borderWidth: number,
): void {
  const data = new Float32Array(24);
  // dominant vec4f
  data[0] = palette.dominant.x; data[1] = palette.dominant.y;
  data[2] = palette.dominant.z; data[3] = palette.dominant.w;
  // shadow vec4f
  data[4] = palette.shadow.x; data[5] = palette.shadow.y;
  data[6] = palette.shadow.z; data[7] = palette.shadow.w;
  // accent vec4f
  data[8] = palette.accent.x; data[9] = palette.accent.y;
  data[10] = palette.accent.z; data[11] = palette.accent.w;
  // muted vec4f
  data[12] = palette.muted.x; data[13] = palette.muted.y;
  data[14] = palette.muted.z; data[15] = palette.muted.w;
  // scalars
  data[16] = palette.warmth;
  data[17] = time;
  // tier as float bits (we'll reinterpret in shader as u32 via bitcast)
  new Uint32Array(data.buffer, 18 * 4, 1)[0] = tier;
  data[19] = intensity;
  data[20] = cardWidth;
  data[21] = cardHeight;
  data[22] = borderWidth;
  data[23] = 0; // padding

  device.queue.writeBuffer(buffer, 0, data);
}
