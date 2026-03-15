/**
 * HEARD — Close Circle Ambient Particle Field
 * Soft ambient particles that drift around the card when viewed in Close Circle context.
 *
 * 256 particles, max 15% opacity, BPM-synced drift.
 * Compute shader updates positions; fragment shader renders soft circles.
 * Colors derive from CardPalette — accent/muted at low opacity.
 */
import type { CardPaletteData } from '../../types/gpu.types';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const PARTICLE_COUNT = 256;
const WORKGROUP_SIZE = 64;
const MAX_ALPHA = 0.15;

// ═══════════════════════════════════════
// WGSL — Compute shader for particle drift
// ═══════════════════════════════════════

export const circleAmbientComputeShader = /* wgsl */ `
  struct AmbientParticle {
    position: vec2f,  // normalized 0–1 in field
    velocity: vec2f,  // drift direction
    phase:    f32,    // individual phase offset for oscillation
    size:     f32,    // radius in pixels: 2–6
    alpha:    f32,    // 0.02–${MAX_ALPHA}
    _pad:     f32,
  };

  struct AmbientUniforms {
    deltaTime:   f32,
    bpmFactor:   f32,  // bpm / 120.0 — normalized beat speed
    time:        f32,
    _pad:        f32,
  };

  @group(0) @binding(0) var<storage, read_write> particles: array<AmbientParticle, ${PARTICLE_COUNT}>;
  @group(0) @binding(1) var<uniform> u: AmbientUniforms;

  // Simple pseudo-random from particle index + time
  fn hash(n: f32) -> f32 {
    return fract(sin(n * 127.1 + 311.7) * 43758.5453);
  }

  @compute @workgroup_size(${WORKGROUP_SIZE})
  fn updateParticles(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= ${PARTICLE_COUNT}u) { return; }

    var p = particles[idx];

    // BPM-synced oscillation: particles pulse gently with beat
    let beatPhase = u.time * u.bpmFactor * 3.14159;
    let beatPulse = sin(beatPhase + p.phase) * 0.3 + 0.7; // 0.4–1.0

    // Drift motion — slow, organic
    let driftSpeed = 0.02 * u.bpmFactor;
    p.position += p.velocity * driftSpeed * u.deltaTime * beatPulse;

    // Wrap around edges with soft re-entry
    if (p.position.x < -0.1) { p.position.x = 1.1; }
    if (p.position.x > 1.1) { p.position.x = -0.1; }
    if (p.position.y < -0.1) { p.position.y = 1.1; }
    if (p.position.y > 1.1) { p.position.y = -0.1; }

    // Gentle sine wave perturbation for organic feel
    let wobble = sin(u.time * 0.5 + p.phase * 6.28) * 0.001;
    p.position.x += wobble;
    p.position.y += cos(u.time * 0.3 + p.phase * 6.28) * 0.001;

    // Alpha pulsing with beat
    let baseAlpha = p.alpha;
    p.alpha = baseAlpha * (0.5 + beatPulse * 0.5);

    particles[idx] = p;
  }
`;

// ═══════════════════════════════════════
// WGSL — Render shader (soft circles)
// ═══════════════════════════════════════

export const circleAmbientRenderShader = /* wgsl */ `
  struct AmbientParticle {
    position: vec2f,
    velocity: vec2f,
    phase:    f32,
    size:     f32,
    alpha:    f32,
    _pad:     f32,
  };

  struct RenderUniforms {
    accentColor: vec4f,
    mutedColor:  vec4f,
    fieldWidth:  f32,
    fieldHeight: f32,
    time:        f32,
    _pad:        f32,
  };

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
  };

  @group(0) @binding(0) var<uniform> u: RenderUniforms;
  @group(0) @binding(1) var<storage, read> particles: array<AmbientParticle, ${PARTICLE_COUNT}>;

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

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let pixelPos = input.uv * vec2f(u.fieldWidth, u.fieldHeight);

    var totalGlow = vec3f(0.0);
    var totalAlpha = 0.0;

    for (var i = 0u; i < ${PARTICLE_COUNT}u; i++) {
      let p = particles[i];
      let pCenter = p.position * vec2f(u.fieldWidth, u.fieldHeight);
      let dist = length(pixelPos - pCenter);
      let radius = p.size;

      // Soft circle falloff
      let glow = smoothstep(radius * 2.0, radius * 0.3, dist);
      if (glow < 0.001) { continue; }

      let contribution = glow * p.alpha;

      // Alternate between accent and muted based on particle index parity
      let useAccent = (i % 2u) == 0u;
      let particleColor = select(u.mutedColor.rgb, u.accentColor.rgb, useAccent);

      totalGlow += particleColor * contribution;
      totalAlpha += contribution;
    }

    // Clamp total alpha to max 15%
    totalAlpha = min(totalAlpha, ${MAX_ALPHA});

    return vec4f(totalGlow, totalAlpha);
  }
`;

// ═══════════════════════════════════════
// Pipeline Creation
// ═══════════════════════════════════════

// AmbientParticle: 2+2+1+1+1+1 = 8 × f32 = 32 bytes
const PARTICLE_STRIDE = 32;
const PARTICLES_BUFFER_SIZE = PARTICLE_COUNT * PARTICLE_STRIDE;
const COMPUTE_UNIFORM_SIZE = 16; // 4 × f32
const RENDER_UNIFORM_SIZE = 48; // 2×vec4f + 4×f32 = 32 + 16 = 48

export interface CircleAmbientResources {
  device: GPUDevice;
  computePipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  particleBuffer: GPUBuffer;
  computeUniformBuffer: GPUBuffer;
  renderUniformBuffer: GPUBuffer;
  computeBindGroup: GPUBindGroup;
  renderBindGroup: GPUBindGroup;
}

export function createCircleAmbientPipeline(device: GPUDevice): CircleAmbientResources {
  // ── Compute pipeline ──
  const computeModule = device.createShaderModule({
    label: 'HEARD Circle Ambient Compute',
    code: circleAmbientComputeShader,
  });

  const particleBuffer = device.createBuffer({
    label: 'Circle Ambient Particles',
    size: PARTICLES_BUFFER_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const computeUniformBuffer = device.createBuffer({
    label: 'Circle Ambient Compute Uniforms',
    size: COMPUTE_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computeBGL = device.createBindGroupLayout({
    label: 'Circle Ambient Compute BGL',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });

  const computeBindGroup = device.createBindGroup({
    layout: computeBGL,
    entries: [
      { binding: 0, resource: { buffer: particleBuffer } },
      { binding: 1, resource: { buffer: computeUniformBuffer } },
    ],
  });

  const computePipeline = device.createComputePipeline({
    label: 'HEARD Circle Ambient Compute Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [computeBGL] }),
    compute: { module: computeModule, entryPoint: 'updateParticles' },
  });

  // Initialize particles with random positions, velocities, phases
  const initData = new Float32Array(PARTICLE_COUNT * 8);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const offset = i * 8;
    initData[offset + 0] = Math.random();               // position.x
    initData[offset + 1] = Math.random();               // position.y
    initData[offset + 2] = (Math.random() - 0.5) * 2;  // velocity.x: -1 to 1
    initData[offset + 3] = (Math.random() - 0.5) * 2;  // velocity.y: -1 to 1
    initData[offset + 4] = Math.random();               // phase: 0–1
    initData[offset + 5] = 2 + Math.random() * 4;       // size: 2–6px
    initData[offset + 6] = 0.02 + Math.random() * (MAX_ALPHA - 0.02); // alpha
    initData[offset + 7] = 0;                            // padding
  }
  device.queue.writeBuffer(particleBuffer, 0, initData);

  // ── Render pipeline ──
  const renderModule = device.createShaderModule({
    label: 'HEARD Circle Ambient Render',
    code: circleAmbientRenderShader,
  });

  const renderUniformBuffer = device.createBuffer({
    label: 'Circle Ambient Render Uniforms',
    size: RENDER_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const renderBGL = device.createBindGroupLayout({
    label: 'Circle Ambient Render BGL',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
    ],
  });

  const renderBindGroup = device.createBindGroup({
    layout: renderBGL,
    entries: [
      { binding: 0, resource: { buffer: renderUniformBuffer } },
      { binding: 1, resource: { buffer: particleBuffer } },
    ],
  });

  const renderPipeline = device.createRenderPipeline({
    label: 'HEARD Circle Ambient Render Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderBGL] }),
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

  return {
    device,
    computePipeline,
    renderPipeline,
    particleBuffer,
    computeUniformBuffer,
    renderUniformBuffer,
    computeBindGroup,
    renderBindGroup,
  };
}

/**
 * Update particle positions via compute shader.
 * Call before rendering each frame.
 */
export function updateCircleAmbientParticles(
  resources: CircleAmbientResources,
  deltaTime: number,
  bpm: number,
  time: number,
): GPUCommandBuffer {
  const { device, computePipeline, computeUniformBuffer, computeBindGroup } = resources;

  const bpmFactor = Math.max(bpm, 60) / 120;
  const data = new Float32Array([deltaTime, bpmFactor, time, 0]);
  device.queue.writeBuffer(computeUniformBuffer, 0, data);

  const encoder = device.createCommandEncoder({ label: 'Circle Ambient Update' });
  const pass = encoder.beginComputePass({ label: 'Circle Ambient Particles' });
  pass.setPipeline(computePipeline);
  pass.setBindGroup(0, computeBindGroup);
  pass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / WORKGROUP_SIZE));
  pass.end();

  return encoder.finish();
}

/**
 * Write render uniforms for the ambient field.
 */
export function writeCircleAmbientRenderUniforms(
  resources: CircleAmbientResources,
  palette: CardPaletteData,
  fieldWidth: number,
  fieldHeight: number,
  time: number,
): void {
  const data = new Float32Array(12);
  // accentColor vec4f
  data[0] = palette.accent.x;
  data[1] = palette.accent.y;
  data[2] = palette.accent.z;
  data[3] = palette.accent.w;
  // mutedColor vec4f
  data[4] = palette.muted.x;
  data[5] = palette.muted.y;
  data[6] = palette.muted.z;
  data[7] = palette.muted.w;
  // scalars
  data[8] = fieldWidth;
  data[9] = fieldHeight;
  data[10] = time;
  data[11] = 0; // padding

  resources.device.queue.writeBuffer(resources.renderUniformBuffer, 0, data);
}
