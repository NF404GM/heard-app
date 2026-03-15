/**
 * HEARD — Card Flip Particle System Compute Shader
 * Drives the card flip animation with a 512-particle burst effect.
 *
 * Animation timeline:
 *   Phase 1 (0–150ms): Card rotates 0° → 90° on Y axis. At 45°: emit particle burst.
 *   Phase 2 (150–300ms): Card rotates 90° → 180°.
 *
 * Particle physics: position integration, gravity, drag, and life decay.
 * All particle colors derive from the card's accent color via CardPalette.
 */
import type { CardPaletteData, ParticleData } from '../types/gpu.types';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const MAX_PARTICLES = 512;
const WORKGROUP_SIZE = 64;

// Physics constants matching the shader
const GRAVITY = -9.8;
const DRAG = 0.97;
const LIFE_DECAY_RATE = 2.0;

// ═══════════════════════════════════════
// WGSL Compute Shader — Particle Physics
// ═══════════════════════════════════════

const FLIP_PARTICLE_SHADER = /* wgsl */ `
  struct Particle {
    position: vec2f,
    velocity: vec2f,
    life:     f32,
    size:     f32,
    color:    vec4f,
  };

  struct FlipUniforms {
    deltaTime:   f32,
    gravity:     f32,
    drag:        f32,
    lifeDecay:   f32,
    accentColor: vec4f,
  };

  @group(0) @binding(0) var<storage, read_write> particles: array<Particle, ${MAX_PARTICLES}>;
  @group(0) @binding(1) var<uniform> uniforms: FlipUniforms;

  @compute @workgroup_size(${WORKGROUP_SIZE})
  fn updateParticles(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= ${MAX_PARTICLES}u) { return; }

    var p = particles[idx];

    // Skip dead particles
    if (p.life <= 0.0) { return; }

    // Physics integration
    p.position += p.velocity * uniforms.deltaTime;
    p.velocity.y += uniforms.gravity * uniforms.deltaTime;
    p.velocity *= uniforms.drag;

    // Life decay
    p.life -= uniforms.deltaTime * uniforms.lifeDecay;
    p.life = max(p.life, 0.0);

    // Fade alpha with life
    p.color.w = p.life * uniforms.accentColor.w;

    // Shrink as life fades
    p.size = max(p.size * 0.995, 0.5);

    particles[idx] = p;
  }
`;

// ═══════════════════════════════════════
// Pipeline Creation
// ═══════════════════════════════════════

interface FlipParticlePipelineResources {
  device: GPUDevice;
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
  particleBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
  readbackBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
}

// Particle struct: vec2f + vec2f + f32 + f32 + vec4f = 8 + 8 + 4 + 4 + 16 = 40 bytes
const PARTICLE_STRIDE = 40;
const PARTICLES_BUFFER_SIZE = MAX_PARTICLES * PARTICLE_STRIDE;

// FlipUniforms: f32 + f32 + f32 + f32 + vec4f = 4 + 4 + 4 + 4 + 16 = 32 bytes
const UNIFORM_SIZE = 32;

export function createFlipParticlePipeline(device: GPUDevice): FlipParticlePipelineResources {
  const shaderModule = device.createShaderModule({
    label: 'HEARD Flip Particle Shader',
    code: FLIP_PARTICLE_SHADER,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Flip Particle Bind Group Layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });

  const pipeline = device.createComputePipeline({
    label: 'HEARD Flip Particle Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    compute: { module: shaderModule, entryPoint: 'updateParticles' },
  });

  const particleBuffer = device.createBuffer({
    label: 'Flip Particles',
    size: PARTICLES_BUFFER_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  const uniformBuffer = device.createBuffer({
    label: 'Flip Uniforms',
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const readbackBuffer = device.createBuffer({
    label: 'Flip Readback',
    size: PARTICLES_BUFFER_SIZE,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: particleBuffer } },
      { binding: 1, resource: { buffer: uniformBuffer } },
    ],
  });

  return { device, pipeline, bindGroupLayout, particleBuffer, uniformBuffer, readbackBuffer, bindGroup };
}

// ═══════════════════════════════════════
// FlipParticleSystem — CPU + GPU hybrid
// ═══════════════════════════════════════

export class FlipParticleSystem {
  private particles: ParticleData[];
  private gpuResources: FlipParticlePipelineResources | null = null;
  private accentColor: { x: number; y: number; z: number; w: number };

  constructor(device: GPUDevice | null, palette: CardPaletteData) {
    this.particles = [];
    this.accentColor = palette.accent;

    if (device) {
      try {
        this.gpuResources = createFlipParticlePipeline(device);
      } catch {
        // Fall back to CPU-only particle system
        this.gpuResources = null;
      }
    }
  }

  /**
   * Emit a burst of 512 particles distributed across the card surface.
   * Card surface is normalized to [-0.5, 0.5] on both axes.
   */
  emit(): void {
    this.particles = [];

    for (let i = 0; i < MAX_PARTICLES; i++) {
      // Distribute across card surface
      const px = (Math.random() - 0.5);
      const py = (Math.random() - 0.5);

      // Outward from center + slight upward bias
      const angle = Math.atan2(py, px);
      const speed = 0.5 + Math.random() * 1.5;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed + 0.3; // upward bias

      // Alpha variation from accent color
      const alphaVariation = 0.5 + Math.random() * 0.5;

      this.particles.push({
        position: { x: px, y: py },
        velocity: { x: vx, y: vy },
        life: 1.0,
        size: 2.0 + Math.random() * 3.0,
        color: {
          x: this.accentColor.x,
          y: this.accentColor.y,
          z: this.accentColor.z,
          w: alphaVariation,
        },
      });
    }

    // Upload initial state to GPU if available
    if (this.gpuResources) {
      this.uploadParticlesToGPU();
    }
  }

  /**
   * Update particle physics for one frame.
   * Uses GPU compute if available, otherwise CPU fallback.
   */
  async update(deltaTime: number): Promise<void> {
    if (this.particles.length === 0) return;

    if (this.gpuResources) {
      await this.updateGPU(deltaTime);
    } else {
      this.updateCPU(deltaTime);
    }

    // Remove dead particles
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  /**
   * Get current live particles for rendering.
   */
  getParticles(): ReadonlyArray<ParticleData> {
    return this.particles;
  }

  /**
   * Destroy GPU resources when done.
   */
  destroy(): void {
    if (this.gpuResources) {
      this.gpuResources.particleBuffer.destroy();
      this.gpuResources.uniformBuffer.destroy();
      this.gpuResources.readbackBuffer.destroy();
      this.gpuResources = null;
    }
  }

  // ═══════════════════════════════════════
  // GPU Path
  // ═══════════════════════════════════════

  private uploadParticlesToGPU(): void {
    if (!this.gpuResources) return;

    const { device, particleBuffer } = this.gpuResources;
    const data = new Float32Array(MAX_PARTICLES * (PARTICLE_STRIDE / 4));

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const offset = i * (PARTICLE_STRIDE / 4); // 10 floats per particle
      data[offset + 0] = p.position.x;
      data[offset + 1] = p.position.y;
      data[offset + 2] = p.velocity.x;
      data[offset + 3] = p.velocity.y;
      data[offset + 4] = p.life;
      data[offset + 5] = p.size;
      // padding to align vec4f color at offset 8 (needs 16-byte alignment)
      data[offset + 6] = p.color.x;
      data[offset + 7] = p.color.y;
      data[offset + 8] = p.color.z;
      data[offset + 9] = p.color.w;
    }

    device.queue.writeBuffer(particleBuffer, 0, data);
  }

  private async updateGPU(deltaTime: number): Promise<void> {
    const res = this.gpuResources!;
    const { device, pipeline, uniformBuffer, particleBuffer, readbackBuffer, bindGroup } = res;

    // Write uniforms
    const uniforms = new Float32Array([
      deltaTime,
      GRAVITY,
      DRAG,
      LIFE_DECAY_RATE,
      this.accentColor.x,
      this.accentColor.y,
      this.accentColor.z,
      this.accentColor.w,
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Dispatch compute
    const encoder = device.createCommandEncoder({ label: 'Flip Particle Update' });
    const pass = encoder.beginComputePass({ label: 'Particle Physics' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(MAX_PARTICLES / WORKGROUP_SIZE));
    pass.end();

    // Copy back for CPU read
    encoder.copyBufferToBuffer(particleBuffer, 0, readbackBuffer, 0, PARTICLES_BUFFER_SIZE);
    device.queue.submit([encoder.finish()]);

    // Read back
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readbackBuffer.getMappedRange().slice(0));
    readbackBuffer.unmap();

    // Update CPU-side particle array from GPU results
    for (let i = 0; i < this.particles.length; i++) {
      const offset = i * (PARTICLE_STRIDE / 4);
      this.particles[i] = {
        position: { x: result[offset], y: result[offset + 1] },
        velocity: { x: result[offset + 2], y: result[offset + 3] },
        life: result[offset + 4],
        size: result[offset + 5],
        color: { x: result[offset + 6], y: result[offset + 7], z: result[offset + 8], w: result[offset + 9] },
      };
    }
  }

  // ═══════════════════════════════════════
  // CPU Fallback
  // ═══════════════════════════════════════

  private updateCPU(deltaTime: number): void {
    for (const p of this.particles) {
      // Position integration
      p.position.x += p.velocity.x * deltaTime;
      p.position.y += p.velocity.y * deltaTime;

      // Gravity
      p.velocity.y += GRAVITY * deltaTime;

      // Drag
      p.velocity.x *= DRAG;
      p.velocity.y *= DRAG;

      // Life decay
      p.life = Math.max(p.life - deltaTime * LIFE_DECAY_RATE, 0);

      // Fade alpha with life
      p.color.w = p.life * this.accentColor.w;

      // Shrink
      p.size = Math.max(p.size * 0.995, 0.5);
    }
  }
}
