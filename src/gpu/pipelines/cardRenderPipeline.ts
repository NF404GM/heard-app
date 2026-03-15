/**
 * HEARD — Master Card Render Pipeline
 * Combines all GPU layers in the correct render order.
 * This is the single pipeline that gets called from <CardComponent /> on every frame.
 *
 * Render order:
 *   Pass 1: Upload album art texture (once, cached)
 *   Pass 2: Draw waveform onto card surface (System 3)
 *   Pass 3: Composite badges onto card surface (System 7)
 *   Pass 4: Draw frame border around card (System 6)
 *   Pass 5: [If flipping] Run particle compute + render (System 2)
 *   Pass 6: [If in Circle feed] Run ambient field (System 4)
 *   Output: Final composited card texture → display
 */

import type { GPUDevice } from 'react-native-wgpu';
import type {
  CardPaletteData,
  FrameTier,
  BadgeSlotData,
  HEARDCard,
} from '../types/gpu.types';
import { FRAME_TIERS } from '../types/gpu.types';

// ═══════════════════════════════════════
// Pipeline State
// ═══════════════════════════════════════

export interface CardRenderState {
  // Card data
  card: HEARDCard;
  palette: CardPaletteData;
  frameTier: FrameTier;
  badges: BadgeSlotData[];
  waveformData: number[];

  // Dynamic state
  isFlipping: boolean;
  flipProgress: number; // 0-1
  isPlaying: boolean;
  playbackTime: number; // seconds
  inCircleFeed: boolean;
  bpm: number;

  // Timing
  time: number;
  deltaTime: number;
}

export interface CardRenderResources {
  // Cached textures
  albumArtTexture: GPUTexture | null;
  cardOutputTexture: GPUTexture | null;

  // Cached buffers
  waveformBuffer: GPUBuffer | null;
  badgeBuffer: GPUBuffer | null;
  frameUniformBuffer: GPUBuffer | null;
  particleBuffer: GPUBuffer | null;

  // Dimensions
  width: number;
  height: number;
}

// ═══════════════════════════════════════
// Master Pipeline
// ═══════════════════════════════════════

export class CardRenderPipeline {
  private device: GPUDevice;
  private resources: CardRenderResources;
  private isInitialized = false;

  constructor(device: GPUDevice) {
    this.device = device;
    this.resources = {
      albumArtTexture: null,
      cardOutputTexture: null,
      waveformBuffer: null,
      badgeBuffer: null,
      frameUniformBuffer: null,
      particleBuffer: null,
      width: 0,
      height: 0,
    };
  }

  /**
   * Initialize pipeline resources for a card.
   * Call once when the card mounts, reuse on every frame.
   */
  async initialize(width: number, height: number): Promise<void> {
    const device = this.device;

    // Create the output texture (card surface)
    this.resources.cardOutputTexture = device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    // Waveform buffer (512 floats)
    this.resources.waveformBuffer = device.createBuffer({
      size: 512 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Badge uniform buffer
    this.resources.badgeBuffer = device.createBuffer({
      // 8 badge slots + time + count
      size: 8 * (4 + 8 + 4 + 16 + 4 + 4) + 4 + 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Frame uniform buffer
    this.resources.frameUniformBuffer = device.createBuffer({
      size: 256, // FrameUniforms struct
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Particle buffer (2048 particles)
    this.resources.particleBuffer = device.createBuffer({
      size: 2048 * (8 + 8 + 4 + 4 + 16), // Particle struct size
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.resources.width = width;
    this.resources.height = height;
    this.isInitialized = true;
  }

  /**
   * Upload album art texture. Called once per card, cached.
   */
  async uploadAlbumArt(imageData: ImageData): Promise<void> {
    const device = this.device;
    const { width, height } = imageData;

    this.resources.albumArtTexture = device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.writeTexture(
      { texture: this.resources.albumArtTexture },
      imageData.data,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height }
    );
  }

  /**
   * Upload waveform data. Called once per card, cached.
   */
  uploadWaveform(data: number[]): void {
    if (!this.resources.waveformBuffer) return;
    const float32 = new Float32Array(512);
    for (let i = 0; i < Math.min(data.length, 512); i++) {
      float32[i] = data[i];
    }
    this.device.queue.writeBuffer(this.resources.waveformBuffer, 0, float32);
  }

  /**
   * Main render pass — called every frame while card is visible.
   * Orchestrates all sub-systems in the correct order.
   */
  render(state: CardRenderState): void {
    if (!this.isInitialized) return;

    const { device, resources } = this;
    const encoder = device.createCommandEncoder();

    // ── Pass 1: Album art is already uploaded (cached) ──

    // ── Pass 2: Waveform ──
    this.renderWaveform(encoder, state);

    // ── Pass 3: Badges ──
    if (state.badges.length > 0) {
      this.renderBadges(encoder, state);
    }

    // ── Pass 4: Frame ──
    this.renderFrame(encoder, state);

    // ── Pass 5: Flip particles (conditional) ──
    if (state.isFlipping) {
      this.renderFlipParticles(encoder, state);
    }

    // ── Pass 6: Circle ambient (conditional) ──
    if (state.inCircleFeed) {
      this.renderCircleAmbient(encoder, state);
    }

    // Submit all passes
    device.queue.submit([encoder.finish()]);
  }

  // ═══════════════════════════════════════
  // Sub-pass implementations
  // ═══════════════════════════════════════

  private renderWaveform(encoder: GPUCommandEncoder, state: CardRenderState): void {
    // Update waveform uniforms: time, isPlaying, playbackProgress
    // The waveform shader reads from the waveform buffer and renders onto the card surface
    // Uses palette.muted at 40% for static, palette.accent at 80% for played portion
  }

  private renderBadges(encoder: GPUCommandEncoder, state: CardRenderState): void {
    // Update badge slots in the uniform buffer
    // The compositor shader iterates badge slots and composites onto card texture
    // Each badge's material is determined by its badgeId → material lookup
  }

  private renderFrame(encoder: GPUCommandEncoder, state: CardRenderState): void {
    // Select frame shader based on tier
    // Update frame uniforms: palette, time, tier, intensity, dimensions, borderWidth
    // Common (0): solid border
    // Warm (1): + glow pulse
    // Foil (2): + shimmer sweep
    // Chroma (3): + chromatic aberration
    // Living (4): + particle flow
  }

  private renderFlipParticles(encoder: GPUCommandEncoder, state: CardRenderState): void {
    // Run particle compute pass: update positions, velocities, life
    // Run particle render pass: draw point sprites with accent color
    // Particles emit at flip midpoint (45° / flipProgress ~0.25)
  }

  private renderCircleAmbient(encoder: GPUCommandEncoder, state: CardRenderState): void {
    // 256 particles drifting upward behind the card
    // Colors from palette, max 15% opacity
    // Pulse size synced to BPM
    // Only active for the centered card in the Circle feed
  }

  // ═══════════════════════════════════════
  // Cleanup
  // ═══════════════════════════════════════

  destroy(): void {
    const { resources } = this;
    resources.albumArtTexture?.destroy();
    resources.cardOutputTexture?.destroy();
    resources.waveformBuffer?.destroy();
    resources.badgeBuffer?.destroy();
    resources.frameUniformBuffer?.destroy();
    resources.particleBuffer?.destroy();
    this.isInitialized = false;
  }
}

// ═══════════════════════════════════════
// Frame tier evaluation
// ═══════════════════════════════════════

export function getFrameTier(card: HEARDCard): FrameTier {
  if (card.isSpecial)              return FRAME_TIERS.LIVING;
  if (card.daysInCollection >= 30) return FRAME_TIERS.CHROMA;
  if (card.sharedToCircle)         return FRAME_TIERS.FOIL;
  if (card.listenCount >= 10)      return FRAME_TIERS.WARM;
  return FRAME_TIERS.COMMON;
}
