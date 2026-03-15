/**
 * HEARD — Tier 4: LIVING Frame Shader
 * Crown jewel — particle flow traveling around border continuously.
 * 128 particles orbiting card perimeter, 2–4px, accent color, varying alpha.
 * Speed varies per particle (0.8×–1.2× base speed).
 * Particles leave short trail (last 4 positions at decreasing opacity).
 *
 * Two-pass system:
 *   Compute shader: update particle positions along perimeter
 *   Fragment shader: render border + particles
 */
import { FRAME_STRUCTS_WGSL, type FramePipelineResources } from './common';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const LIVING_PARTICLE_COUNT = 128;
const TRAIL_LENGTH = 4;
const WORKGROUP_SIZE = 64;

// ═══════════════════════════════════════
// WGSL — Compute shader for particle orbits
// ═══════════════════════════════════════

export const livingParticleComputeShader = /* wgsl */ `
  struct LivingParticle {
    phase:     f32,   // 0→1 position along perimeter
    speed:     f32,   // 0.8–1.2 multiplier
    size:      f32,   // 2–4 px
    alpha:     f32,   // 0.3–0.9
    // Trail: last 4 positions as perimeter phase values
    trail0:    f32,
    trail1:    f32,
    trail2:    f32,
    trail3:    f32,
  };

  struct LivingUniforms {
    deltaTime: f32,
    baseSpeed: f32, // perimeter loops per second
    _pad0: f32,
    _pad1: f32,
  };

  @group(0) @binding(0) var<storage, read_write> particles: array<LivingParticle, ${LIVING_PARTICLE_COUNT}>;
  @group(0) @binding(1) var<uniform> uniforms: LivingUniforms;

  @compute @workgroup_size(${WORKGROUP_SIZE})
  fn updateParticles(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= ${LIVING_PARTICLE_COUNT}u) { return; }

    var p = particles[idx];

    // Shift trail history
    p.trail3 = p.trail2;
    p.trail2 = p.trail1;
    p.trail1 = p.trail0;
    p.trail0 = p.phase;

    // Advance position along perimeter
    p.phase += uniforms.baseSpeed * p.speed * uniforms.deltaTime;
    p.phase = fract(p.phase); // wrap around

    particles[idx] = p;
  }
`;

// ═══════════════════════════════════════
// WGSL — Render shader (border + particles)
// ═══════════════════════════════════════

export const livingFrameShader = /* wgsl */ `
  ${FRAME_STRUCTS_WGSL}

  struct LivingParticle {
    phase:  f32,
    speed:  f32,
    size:   f32,
    alpha:  f32,
    trail0: f32,
    trail1: f32,
    trail2: f32,
    trail3: f32,
  };

  @group(0) @binding(0) var<uniform> u: FrameUniforms;
  @group(0) @binding(1) var<storage, read> particles: array<LivingParticle, ${LIVING_PARTICLE_COUNT}>;

  // Convert perimeter phase (0→1) to pixel coordinate on card border
  fn perimeterToPixel(phase: f32, w: f32, h: f32, border: f32) -> vec2f {
    let perimeter = 2.0 * (w + h);
    let dist = phase * perimeter;
    let mid = border * 0.5; // center of border thickness

    // Top edge: left to right
    if (dist < w) {
      return vec2f(dist, mid);
    }
    let d1 = dist - w;
    // Right edge: top to bottom
    if (d1 < h) {
      return vec2f(w - mid, d1);
    }
    let d2 = d1 - h;
    // Bottom edge: right to left
    if (d2 < w) {
      return vec2f(w - d2, h - mid);
    }
    // Left edge: bottom to top
    let d3 = d2 - w;
    return vec2f(mid, h - d3);
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

    // Base border — dominant color
    let borderMask = smoothstep(-0.5, 0.5, -outerDist) * smoothstep(-0.5, 0.5, innerDist);
    var color = u.dominant.rgb;
    var alpha = u.dominant.a * borderMask;

    // Particle contributions — additive blend on top of border
    var particleGlow = 0.0;
    for (var i = 0u; i < ${LIVING_PARTICLE_COUNT}u; i++) {
      let part = particles[i];

      // Current position
      let partPos = perimeterToPixel(part.phase, u.cardWidth, u.cardHeight, u.borderWidth);
      let dist = length(pixelCoord - partPos);
      let partRadius = part.size;
      let contribution = smoothstep(partRadius, partRadius * 0.3, dist) * part.alpha;

      // Trail positions with decreasing opacity
      let t0Pos = perimeterToPixel(part.trail0, u.cardWidth, u.cardHeight, u.borderWidth);
      let t0Dist = length(pixelCoord - t0Pos);
      let t0 = smoothstep(partRadius, partRadius * 0.3, t0Dist) * part.alpha * 0.6;

      let t1Pos = perimeterToPixel(part.trail1, u.cardWidth, u.cardHeight, u.borderWidth);
      let t1Dist = length(pixelCoord - t1Pos);
      let t1 = smoothstep(partRadius, partRadius * 0.3, t1Dist) * part.alpha * 0.35;

      let t2Pos = perimeterToPixel(part.trail2, u.cardWidth, u.cardHeight, u.borderWidth);
      let t2Dist = length(pixelCoord - t2Pos);
      let t2 = smoothstep(partRadius, partRadius * 0.3, t2Dist) * part.alpha * 0.15;

      let t3Pos = perimeterToPixel(part.trail3, u.cardWidth, u.cardHeight, u.borderWidth);
      let t3Dist = length(pixelCoord - t3Pos);
      let t3 = smoothstep(partRadius, partRadius * 0.3, t3Dist) * part.alpha * 0.05;

      particleGlow += contribution + t0 + t1 + t2 + t3;
    }

    // Clamp and blend particles as accent color
    particleGlow = min(particleGlow, 1.0);
    color = mix(color, u.accent.rgb, particleGlow);
    alpha = max(alpha, particleGlow * u.accent.a);

    return vec4f(color, alpha);
  }
`;

// ═══════════════════════════════════════
// Pipeline Creation
// ═══════════════════════════════════════

const UNIFORM_SIZE = 96;
// LivingParticle: 8 × f32 = 32 bytes per particle
const PARTICLE_STRIDE = 32;
const PARTICLES_BUFFER_SIZE = LIVING_PARTICLE_COUNT * PARTICLE_STRIDE;
// LivingUniforms: 4 × f32 = 16 bytes
const COMPUTE_UNIFORM_SIZE = 16;

export interface LivingFramePipelineResources extends FramePipelineResources {
  computePipeline: GPUComputePipeline;
  particleBuffer: GPUBuffer;
  computeUniformBuffer: GPUBuffer;
  computeBindGroup: GPUBindGroup;
  renderBindGroup: GPUBindGroup;
}

export function createLivingFramePipeline(device: GPUDevice): LivingFramePipelineResources {
  // ── Compute pipeline for particle updates ──
  const computeModule = device.createShaderModule({
    label: 'HEARD Living Particle Compute',
    code: livingParticleComputeShader,
  });

  const particleBuffer = device.createBuffer({
    label: 'Living Particles',
    size: PARTICLES_BUFFER_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const computeUniformBuffer = device.createBuffer({
    label: 'Living Compute Uniforms',
    size: COMPUTE_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computeBindGroupLayout = device.createBindGroupLayout({
    label: 'Living Compute BGL',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });

  const computeBindGroup = device.createBindGroup({
    layout: computeBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: particleBuffer } },
      { binding: 1, resource: { buffer: computeUniformBuffer } },
    ],
  });

  const computePipeline = device.createComputePipeline({
    label: 'HEARD Living Particle Compute Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [computeBindGroupLayout] }),
    compute: { module: computeModule, entryPoint: 'updateParticles' },
  });

  // Initialize particles with random phases, speeds, sizes, alphas
  const initData = new Float32Array(LIVING_PARTICLE_COUNT * 8);
  for (let i = 0; i < LIVING_PARTICLE_COUNT; i++) {
    const offset = i * 8;
    initData[offset + 0] = Math.random(); // phase
    initData[offset + 1] = 0.8 + Math.random() * 0.4; // speed: 0.8–1.2
    initData[offset + 2] = 2.0 + Math.random() * 2.0; // size: 2–4
    initData[offset + 3] = 0.3 + Math.random() * 0.6; // alpha: 0.3–0.9
    // Trail starts at same position
    initData[offset + 4] = initData[offset]; // trail0
    initData[offset + 5] = initData[offset]; // trail1
    initData[offset + 6] = initData[offset]; // trail2
    initData[offset + 7] = initData[offset]; // trail3
  }
  device.queue.writeBuffer(particleBuffer, 0, initData);

  // ── Render pipeline for border + particles ──
  const renderModule = device.createShaderModule({
    label: 'HEARD Living Frame Render',
    code: livingFrameShader,
  });

  const uniformBuffer = device.createBuffer({
    label: 'Living Frame Uniforms',
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const renderBindGroupLayout = device.createBindGroupLayout({
    label: 'Living Render BGL',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
    ],
  });

  const renderBindGroup = device.createBindGroup({
    layout: renderBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: particleBuffer } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'HEARD Living Frame Render Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderBindGroupLayout] }),
    vertex: { module: renderModule, entryPoint: 'vertexMain' },
    fragment: {
      module: renderModule,
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

  // Bind group alias for the common interface
  const bindGroup = renderBindGroup;

  return {
    device,
    pipeline,
    uniformBuffer,
    bindGroup,
    computePipeline,
    particleBuffer,
    computeUniformBuffer,
    computeBindGroup,
    renderBindGroup,
  };
}

/**
 * Write compute uniforms and dispatch particle update.
 * Call before rendering the frame each tick.
 */
export function updateLivingParticles(
  resources: LivingFramePipelineResources,
  deltaTime: number,
  baseSpeed: number,
): GPUCommandBuffer {
  const { device, computePipeline, computeUniformBuffer, computeBindGroup } = resources;

  const data = new Float32Array([deltaTime, baseSpeed, 0, 0]);
  device.queue.writeBuffer(computeUniformBuffer, 0, data);

  const encoder = device.createCommandEncoder({ label: 'Living Particle Update' });
  const pass = encoder.beginComputePass({ label: 'Living Particles' });
  pass.setPipeline(computePipeline);
  pass.setBindGroup(0, computeBindGroup);
  pass.dispatchWorkgroups(Math.ceil(LIVING_PARTICLE_COUNT / WORKGROUP_SIZE));
  pass.end();

  return encoder.finish();
}
