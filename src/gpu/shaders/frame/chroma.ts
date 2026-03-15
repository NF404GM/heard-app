/**
 * HEARD — Tier 3: CHROMA Frame Shader
 * Chromatic aberration split on border edges.
 * Red channel offset: +1.5px outward, Blue: -1.5px inward, Green: centered.
 * Subtle glitch/lens effect that reads as depth and age.
 * Static — no animation.
 */
import { FRAME_STRUCTS_WGSL, type FramePipelineResources } from './common';

// ═══════════════════════════════════════
// WGSL Shader
// ═══════════════════════════════════════

export const chromaFrameShader = /* wgsl */ `
  ${FRAME_STRUCTS_WGSL}

  @group(0) @binding(0) var<uniform> u: FrameUniforms;

  // Compute border mask at an offset position for chromatic split
  fn borderMaskAt(uv: vec2f, offset: vec2f) -> f32 {
    let pixelCoord = (uv + offset / vec2f(u.cardWidth, u.cardHeight)) * vec2f(u.cardWidth, u.cardHeight);
    let center = vec2f(u.cardWidth, u.cardHeight) * 0.5;
    let p = pixelCoord - center;
    let halfSize = center;
    let radius = 12.0;

    let outerDist = roundedRectSDF(p, halfSize, radius);
    let innerDist = roundedRectSDF(p, halfSize - vec2f(u.borderWidth), max(radius - u.borderWidth, 0.0));

    return smoothstep(-0.5, 0.5, -outerDist) * smoothstep(-0.5, 0.5, innerDist);
  }

  // Compute outward direction from card center at this UV
  fn outwardDir(uv: vec2f) -> vec2f {
    let pixelCoord = uv * vec2f(u.cardWidth, u.cardHeight);
    let center = vec2f(u.cardWidth, u.cardHeight) * 0.5;
    let toEdge = pixelCoord - center;
    let len = length(toEdge);
    if (len < 0.001) { return vec2f(0.0, 1.0); }
    return toEdge / len;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let dir = outwardDir(input.uv);
    let chromaticOffset = 1.5; // pixels

    // Red: shifted outward (+1.5px)
    let redOffset = dir * chromaticOffset;
    let redMask = borderMaskAt(input.uv, redOffset);

    // Green: centered (no offset)
    let greenMask = borderMaskAt(input.uv, vec2f(0.0));

    // Blue: shifted inward (-1.5px)
    let blueOffset = dir * (-chromaticOffset);
    let blueMask = borderMaskAt(input.uv, blueOffset);

    // Each channel uses dominant color but only its own channel's mask
    let r = u.dominant.r * redMask;
    let g = u.dominant.g * greenMask;
    let b = u.dominant.b * blueMask;

    // Alpha is the union of all three masks
    let alpha = max(max(redMask, greenMask), blueMask) * u.dominant.a;

    // Where channels diverge, the split becomes visible as colored fringes
    return vec4f(r, g, b, alpha);
  }
`;

// ═══════════════════════════════════════
// Pipeline Creation
// ═══════════════════════════════════════

const UNIFORM_SIZE = 96;

export function createChromaFramePipeline(device: GPUDevice): FramePipelineResources {
  const module = device.createShaderModule({
    label: 'HEARD Chroma Frame',
    code: chromaFrameShader,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Chroma Frame Bind Group Layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const uniformBuffer = device.createBuffer({
    label: 'Chroma Frame Uniforms',
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
    label: 'HEARD Chroma Frame Pipeline',
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
