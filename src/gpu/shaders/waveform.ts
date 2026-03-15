/**
 * HEARD — Waveform Visualization Shaders
 * Vertex/fragment shader pair for rendering waveform on the card.
 *
 * Modes:
 *   Static: Smooth Bezier curve, muted color at 40% opacity, bottom 20% of card.
 *   Active: Pulses with playback, lights up left-to-right.
 *     - Played portion: accent color at 80% opacity.
 *     - Unplayed portion: muted color at 30% opacity.
 *     - Cursor dot at current playback position.
 *
 * All colors derive from CardPalette — no hardcoded colors.
 */
import type { CardPaletteData } from '../types/gpu.types';

// ═══════════════════════════════════════
// Constants
// ═══════════════════════════════════════

const WAVEFORM_SAMPLES = 512;
const VERTICES_PER_SEGMENT = 6; // 2 triangles per segment
const MAX_VERTICES = (WAVEFORM_SAMPLES - 1) * VERTICES_PER_SEGMENT;

// ═══════════════════════════════════════
// WGSL Shaders
// ═══════════════════════════════════════

const WAVEFORM_VERTEX_SHADER = /* wgsl */ `
  struct WaveformUniforms {
    accentColor:  vec4f,
    mutedColor:   vec4f,
    time:         f32,
    isPlaying:    f32,    // 0.0 or 1.0
    progress:     f32,    // 0.0 → 1.0 playback position
    sampleCount:  f32,
    cardWidth:    f32,
    cardHeight:   f32,
    waveformY:    f32,    // y-offset for bottom 20%
    waveformH:    f32,    // height of waveform region
  };

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
    @location(1) uv: vec2f,
  };

  @group(0) @binding(0) var<uniform> uniforms: WaveformUniforms;
  @group(0) @binding(1) var<storage, read> samples: array<f32, ${WAVEFORM_SAMPLES}>;

  // Cubic Bezier interpolation between samples for smooth curves
  fn sampleSmooth(idx: f32) -> f32 {
    let i0 = u32(floor(idx));
    let i1 = min(i0 + 1u, ${WAVEFORM_SAMPLES - 1}u);
    let i_prev = select(i0 - 1u, 0u, i0 == 0u);
    let i_next = min(i1 + 1u, ${WAVEFORM_SAMPLES - 1}u);

    let t = fract(idx);

    // Catmull-Rom spline for smooth interpolation
    let p0 = samples[i_prev];
    let p1 = samples[i0];
    let p2 = samples[i1];
    let p3 = samples[i_next];

    let t2 = t * t;
    let t3 = t2 * t;

    return 0.5 * (
      (2.0 * p1) +
      (-p0 + p2) * t +
      (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
      (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    );
  }

  @vertex
  fn vertexMain(@builtin(vertex_index) vertexIdx: u32) -> VertexOutput {
    // Each segment (pair of adjacent samples) produces 2 triangles (6 vertices)
    let segIdx = vertexIdx / 6u;
    let triVert = vertexIdx % 6u;

    let totalSegs = u32(uniforms.sampleCount) - 1u;
    if (segIdx >= totalSegs) {
      var out: VertexOutput;
      out.position = vec4f(0.0, 0.0, 0.0, 1.0);
      out.color = vec4f(0.0);
      out.uv = vec2f(0.0);
      return out;
    }

    // Determine which sample and whether top or bottom of the ribbon
    var sampleIdx: u32;
    var isTop: bool;
    switch (triVert) {
      case 0u: { sampleIdx = segIdx;     isTop = true;  }
      case 1u: { sampleIdx = segIdx;     isTop = false; }
      case 2u: { sampleIdx = segIdx + 1u; isTop = true;  }
      case 3u: { sampleIdx = segIdx + 1u; isTop = true;  }
      case 4u: { sampleIdx = segIdx;     isTop = false; }
      case 5u: { sampleIdx = segIdx + 1u; isTop = false; }
      default: { sampleIdx = 0u; isTop = true; }
    }

    let normalizedX = f32(sampleIdx) / f32(totalSegs);
    let amplitude = sampleSmooth(f32(sampleIdx));

    // Position in card space — waveform occupies bottom 20% of card
    let x = normalizedX * 2.0 - 1.0; // NDC: -1 to 1
    let baseY = uniforms.waveformY;
    let halfH = amplitude * uniforms.waveformH * 0.5;

    let y = select(baseY - halfH, baseY + halfH, isTop);

    // Pulse effect when playing
    var pulse = 1.0;
    if (uniforms.isPlaying > 0.5) {
      pulse = 1.0 + 0.05 * sin(uniforms.time * 3.0 + normalizedX * 6.28);
    }

    var out: VertexOutput;
    out.position = vec4f(x, y * pulse, 0.0, 1.0);
    out.uv = vec2f(normalizedX, select(0.0, 1.0, isTop));

    // Color: played = accent @ 80%, unplayed = muted @ 30%
    if (uniforms.isPlaying > 0.5 && normalizedX <= uniforms.progress) {
      out.color = vec4f(uniforms.accentColor.rgb, 0.8);
    } else if (uniforms.isPlaying > 0.5) {
      out.color = vec4f(uniforms.mutedColor.rgb, 0.3);
    } else {
      // Static mode: muted @ 40%
      out.color = vec4f(uniforms.mutedColor.rgb, 0.4);
    }

    return out;
  }
`;

const WAVEFORM_FRAGMENT_SHADER = /* wgsl */ `
  struct FragInput {
    @location(0) color: vec4f,
    @location(1) uv: vec2f,
  };

  struct WaveformUniforms {
    accentColor:  vec4f,
    mutedColor:   vec4f,
    time:         f32,
    isPlaying:    f32,
    progress:     f32,
    sampleCount:  f32,
    cardWidth:    f32,
    cardHeight:   f32,
    waveformY:    f32,
    waveformH:    f32,
  };

  @group(0) @binding(0) var<uniform> uniforms: WaveformUniforms;

  @fragment
  fn fragmentMain(input: FragInput) -> @location(0) vec4f {
    var color = input.color;

    // Soft edge fade at top/bottom of ribbon
    let edgeDist = min(input.uv.y, 1.0 - input.uv.y);
    let edgeFade = smoothstep(0.0, 0.1, edgeDist);
    color.a *= edgeFade;

    // Cursor dot: bright accent circle at playback position
    if (uniforms.isPlaying > 0.5) {
      let cursorX = uniforms.progress;
      let dist = abs(input.uv.x - cursorX);
      if (dist < 0.008) {
        let dotAlpha = smoothstep(0.008, 0.002, dist);
        color = mix(color, vec4f(uniforms.accentColor.rgb, 1.0), dotAlpha);
      }
    }

    return color;
  }
`;

// ═══════════════════════════════════════
// Pipeline Creation
// ═══════════════════════════════════════

interface WaveformPipelineResources {
  device: GPUDevice;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  sampleBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
}

// WaveformUniforms: 2 × vec4f + 6 × f32 = 32 + 24 = 56 bytes, pad to 64
const UNIFORM_SIZE = 64;

export function createWaveformPipeline(device: GPUDevice): WaveformPipelineResources {
  const vertexModule = device.createShaderModule({
    label: 'HEARD Waveform Vertex',
    code: WAVEFORM_VERTEX_SHADER,
  });

  const fragmentModule = device.createShaderModule({
    label: 'HEARD Waveform Fragment',
    code: WAVEFORM_FRAGMENT_SHADER,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Waveform Bind Group Layout',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });

  const uniformBuffer = device.createBuffer({
    label: 'Waveform Uniforms',
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const sampleBuffer = device.createBuffer({
    label: 'Waveform Samples',
    size: WAVEFORM_SAMPLES * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: sampleBuffer } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'HEARD Waveform Render Pipeline',
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: {
      module: vertexModule,
      entryPoint: 'vertexMain',
    },
    fragment: {
      module: fragmentModule,
      entryPoint: 'fragmentMain',
      targets: [{
        format: 'bgra8unorm',
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  return { device, pipeline, uniformBuffer, sampleBuffer, bindGroup };
}

// ═══════════════════════════════════════
// WaveformRenderer
// ═══════════════════════════════════════

export class WaveformRenderer {
  private resources: WaveformPipelineResources;
  private palette: CardPaletteData;
  private waveformData: Float32Array;
  private context: GPUCanvasContext;

  constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    palette: CardPaletteData,
    waveformData: number[],
  ) {
    this.resources = createWaveformPipeline(device);
    this.palette = palette;
    this.context = context;

    // Pad or truncate waveform data to exactly 512 samples
    this.waveformData = new Float32Array(WAVEFORM_SAMPLES);
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      this.waveformData[i] = i < waveformData.length ? waveformData[i] : 0;
    }

    // Upload waveform data
    device.queue.writeBuffer(this.resources.sampleBuffer, 0, this.waveformData);
  }

  /**
   * Render one frame of the waveform.
   * @param time - elapsed time in seconds
   * @param isPlaying - whether audio is currently playing
   * @param playbackProgress - 0.0 → 1.0 position in the track
   */
  render(time: number, isPlaying: boolean, playbackProgress: number): void {
    const { device, pipeline, uniformBuffer, bindGroup } = this.resources;

    // Write uniforms
    const uniforms = new Float32Array(16); // 64 bytes / 4
    // accentColor vec4f
    uniforms[0] = this.palette.accent.x;
    uniforms[1] = this.palette.accent.y;
    uniforms[2] = this.palette.accent.z;
    uniforms[3] = this.palette.accent.w;
    // mutedColor vec4f
    uniforms[4] = this.palette.muted.x;
    uniforms[5] = this.palette.muted.y;
    uniforms[6] = this.palette.muted.z;
    uniforms[7] = this.palette.muted.w;
    // scalars
    uniforms[8] = time;
    uniforms[9] = isPlaying ? 1.0 : 0.0;
    uniforms[10] = playbackProgress;
    uniforms[11] = WAVEFORM_SAMPLES;
    uniforms[12] = 1.0; // cardWidth (normalized)
    uniforms[13] = 1.0; // cardHeight (normalized)
    uniforms[14] = -0.8; // waveformY — bottom 20% of card (in NDC)
    uniforms[15] = 0.15; // waveformH — height of waveform region

    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Get current texture to render to
    const textureView = this.context.getCurrentTexture().createView();

    const encoder = device.createCommandEncoder({ label: 'Waveform Render' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        loadOp: 'load',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(MAX_VERTICES);
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  /**
   * Update palette colors (e.g. when card changes).
   */
  updatePalette(palette: CardPaletteData): void {
    this.palette = palette;
  }

  /**
   * Update waveform sample data.
   */
  updateWaveform(data: number[]): void {
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      this.waveformData[i] = i < data.length ? data[i] : 0;
    }
    this.resources.device.queue.writeBuffer(
      this.resources.sampleBuffer,
      0,
      this.waveformData,
    );
  }

  /**
   * Destroy GPU resources.
   */
  destroy(): void {
    this.resources.uniformBuffer.destroy();
    this.resources.sampleBuffer.destroy();
  }
}
