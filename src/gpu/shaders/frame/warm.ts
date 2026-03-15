/**
 * HEARD — Tier 1: WARM Frame Shader
 * Solid border (same as Common) plus soft outer glow.
 * Glow: accent color, 8px radius, exponential falloff.
 * Breathing pulse: sin(time * 0.5) * 0.3 + 0.7 — gentle, not flashing.
 */
import { FRAME_STRUCTS_WGSL, type FramePipelineResources } from './common';

// ═══════════════════════════════════════
// WGSL Shader
// ═══════════════════════════════════════

export const warmFrameShader = /* wgsl */ `
  ${FRAME_STRUCTS_WGSL}

  @group(0) @binding(0) var<uniform> u: FrameUniforms;

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let pixelCoord = input.uv * vec2f(u.cardWidth, u.cardHeight);
    let center = vec2f(u.cardWidth, u.cardHeight) * 0.5;
    let p = pixelCoord - center;
    let halfSize = center;
    let radius = 12.0;

    let outerDist = roundedRectSDF(p, halfSize, radius);
    let innerDist = roundedRectSDF(p, halfSize - vec2f(u.borderWidth), max(radius - u.borderWidth, 0.0));

    // Solid border — dominant color
    let borderMask = smoothstep(-0.5, 0.5, -outerDist) * smoothstep(-0.5, 0.5, innerDist);
    let borderColor = u.dominant;

    // Outer glow — accent color with exponential falloff
    let glowRadius = 8.0;
    let glowDist = max(outerDist, 0.0); // only outside the card
    let glowFalloff = exp(-glowDist * glowDist / (glowRadius * glowRadius * 0.5));

    // Breathing pulse — slow, gentle
    let breathe = sin(u.time * 0.5) * 0.3 + 0.7;
    let glowAlpha = glowFalloff * 0.6 * breathe * u.intensity;

    let glowColor = vec4f(u.accent.rgb, glowAlpha);

    // Composite: glow behind border
    let border = vec4f(borderColor.rgb, borderColor.a * borderMask);

    // Premultiplied alpha blend: glow first, then border on top
    let glow = vec4f(glowColor.rgb * glowColor.a, glowColor.a);
    let front = vec4f(border.rgb * border.a, border.a);

    let composited = front + glow * (1.0 - front.a);

    return composited;
  }
`;

// ═══════════════════════════════════════
// Pipeline Creation
// ═══════════════════════════════════════

const UNIFORM_SIZE = 96;

export function createWarmFramePipeline(device: GPUDevice): FramePipelineResources {
  const module = device.createShaderModule({
    label: 'HEARD Warm Frame',
    code: warmFrameShader,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Warm Frame Bind Group Layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const uniformBuffer = device.createBuffer({
    label: 'Warm Frame Uniforms',
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
    label: 'HEARD Warm Frame Pipeline',
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
