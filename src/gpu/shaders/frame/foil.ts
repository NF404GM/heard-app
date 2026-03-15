/**
 * HEARD — Tier 2: FOIL Frame Shader
 * Animated shimmer sweep across border.
 * Bright near-white (#F0EEE9) highlight at 60% opacity, one loop every 3 seconds.
 * Faint rainbow iridescence — hue shifts ±15° as sweep passes.
 */
import { FRAME_STRUCTS_WGSL, type FramePipelineResources } from './common';

// ═══════════════════════════════════════
// WGSL Shader
// ═══════════════════════════════════════

export const foilFrameShader = /* wgsl */ `
  ${FRAME_STRUCTS_WGSL}

  @group(0) @binding(0) var<uniform> u: FrameUniforms;

  // HSL → RGB for iridescence hue shift
  fn hueToRgb(p: f32, q: f32, tIn: f32) -> f32 {
    var t = tIn;
    if (t < 0.0) { t += 1.0; }
    if (t > 1.0) { t -= 1.0; }
    if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
    if (t < 1.0 / 2.0) { return q; }
    if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
    return p;
  }

  fn hslToRgb(h: f32, s: f32, l: f32) -> vec3f {
    if (s < 0.001) { return vec3f(l); }
    let q = select(l + s - l * s, l * (1.0 + s), l < 0.5);
    let p = 2.0 * l - q;
    let hNorm = h / 360.0;
    return vec3f(
      hueToRgb(p, q, hNorm + 1.0 / 3.0),
      hueToRgb(p, q, hNorm),
      hueToRgb(p, q, hNorm - 1.0 / 3.0)
    );
  }

  // Convert RGB to approximate hue in degrees
  fn rgbToHue(r: f32, g: f32, b: f32) -> f32 {
    let cMax = max(max(r, g), b);
    let cMin = min(min(r, g), b);
    let delta = cMax - cMin;
    if (delta < 0.001) { return 0.0; }
    var h: f32;
    if (cMax == r) { h = ((g - b) / delta) % 6.0; }
    else if (cMax == g) { h = (b - r) / delta + 2.0; }
    else { h = (r - g) / delta + 4.0; }
    h *= 60.0;
    if (h < 0.0) { h += 360.0; }
    return h;
  }

  // Compute normalized position along card perimeter (0→1)
  fn perimeterPosition(uv: vec2f, w: f32, h: f32) -> f32 {
    let x = uv.x * w;
    let y = uv.y * h;
    let perimeter = 2.0 * (w + h);

    // Top edge
    if (y < 2.0) { return x / perimeter; }
    // Right edge
    if (x > w - 2.0) { return (w + y) / perimeter; }
    // Bottom edge
    if (y > h - 2.0) { return (w + h + (w - x)) / perimeter; }
    // Left edge
    return (2.0 * w + h + (h - y)) / perimeter;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let pixelCoord = input.uv * vec2f(u.cardWidth, u.cardHeight);
    let center = vec2f(u.cardWidth, u.cardHeight) * 0.5;
    let p = pixelCoord - center;
    let halfSize = center;
    let radius = 12.0;

    let outerDist = roundedRectSDF(p, halfSize, radius);
    let innerDist = roundedRectSDF(p, halfSize - vec2f(u.borderWidth), max(radius - u.borderWidth, 0.0));

    // Border mask
    let borderMask = smoothstep(-0.5, 0.5, -outerDist) * smoothstep(-0.5, 0.5, innerDist);

    // Base border color — dominant
    var baseColor = u.dominant.rgb;

    // Shimmer sweep: travel around perimeter, 3-second loop
    let perimPos = perimeterPosition(input.uv, u.cardWidth, u.cardHeight);
    let sweepPhase = fract(u.time / 3.0); // 0→1 every 3 seconds
    let sweepDist = abs(perimPos - sweepPhase);
    let wrappedDist = min(sweepDist, 1.0 - sweepDist); // handle wraparound
    let sweepWidth = 0.12;
    let sweepIntensity = smoothstep(sweepWidth, 0.0, wrappedDist);

    // Near-white highlight: #F0EEE9 = rgb(240, 238, 233) / 255
    let highlightColor = vec3f(0.941, 0.933, 0.914);
    let highlight = mix(baseColor, highlightColor, sweepIntensity * 0.6);

    // Iridescence: hue-shift ±15° based on sweep position
    let baseHue = rgbToHue(u.dominant.r, u.dominant.g, u.dominant.b);
    let hueOffset = (perimPos - sweepPhase) * 30.0; // ±15° range
    let iridescentHue = baseHue + hueOffset;
    let iridescentRgb = hslToRgb(iridescentHue, 0.6, 0.7);

    // Blend iridescence faintly only during sweep
    let iridescentStrength = sweepIntensity * 0.15;
    let finalColor = mix(highlight, iridescentRgb, iridescentStrength);

    return vec4f(finalColor, u.dominant.a * borderMask);
  }
`;

// ═══════════════════════════════════════
// Pipeline Creation
// ═══════════════════════════════════════

const UNIFORM_SIZE = 96;

export function createFoilFramePipeline(device: GPUDevice): FramePipelineResources {
  const module = device.createShaderModule({
    label: 'HEARD Foil Frame',
    code: foilFrameShader,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Foil Frame Bind Group Layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const uniformBuffer = device.createBuffer({
    label: 'Foil Frame Uniforms',
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
    label: 'HEARD Foil Frame Pipeline',
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
