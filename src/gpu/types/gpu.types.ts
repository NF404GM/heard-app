/**
 * HEARD — GPU Type Definitions
 * All shared TypeGPU struct definitions used across GPU systems.
 * This file is the foundation — everything else depends on it.
 */
import tgpu, { d } from 'typegpu';

// ═══════════════════════════════════════
// CARD PALETTE — output of System 1, input to all other systems
// ═══════════════════════════════════════

export const CardPalette = d.struct({
  dominant: d.vec4f,   // primary color from album art
  shadow:   d.vec4f,   // darkened version for depth
  accent:   d.vec4f,   // highlight/pop color
  muted:    d.vec4f,   // background wash color
  warmth:   d.f32,     // 0.0 = cool, 1.0 = warm — affects all systems
});

export type CardPaletteData = d.Infer<typeof CardPalette>;

// ═══════════════════════════════════════
// FRAME UNIFORMS — drives all frame tiers
// ═══════════════════════════════════════

export const FrameUniforms = d.struct({
  palette:     CardPalette,
  time:        d.f32,
  tier:        d.u32,     // 0=common 1=warm 2=foil 3=chroma 4=living
  intensity:   d.f32,
  cardWidth:   d.f32,
  cardHeight:  d.f32,
  borderWidth: d.f32,
});

export type FrameUniformsData = d.Infer<typeof FrameUniforms>;

// ═══════════════════════════════════════
// BADGE SYSTEM
// ═══════════════════════════════════════

export const BadgeSlot = d.struct({
  badgeId:    d.u32,     // see BADGE_IDS registry below
  position:   d.vec2f,   // normalized 0–1 on card surface
  scale:      d.f32,
  color:      d.vec4f,   // derived from palette or sender color
  animPhase:  d.f32,     // stagger offset for independent animations
  visible:    d.u32,     // 0 or 1
});

export type BadgeSlotData = d.Infer<typeof BadgeSlot>;

export const BadgeCompositorUniforms = d.struct({
  slots: d.arrayOf(BadgeSlot, 8),
  time:  d.f32,
  count: d.u32,
});

export type BadgeCompositorUniformsData = d.Infer<typeof BadgeCompositorUniforms>;

// ═══════════════════════════════════════
// WAVEFORM BUFFER — 512 amplitude samples
// ═══════════════════════════════════════

export const WaveformBuffer = d.arrayOf(d.f32, 512);
export type WaveformBufferData = d.Infer<typeof WaveformBuffer>;

// ═══════════════════════════════════════
// PARTICLE SYSTEM — used in card flip and Living frame
// ═══════════════════════════════════════

export const Particle = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
  life:     d.f32,     // 1.0 = alive, 0.0 = dead
  size:     d.f32,
  color:    d.vec4f,
});

export type ParticleData = d.Infer<typeof Particle>;

export const ParticleBuffer = d.arrayOf(Particle, 2048);
export type ParticleBufferData = d.Infer<typeof ParticleBuffer>;

// ═══════════════════════════════════════
// BADGE ID REGISTRY — source of truth
// ═══════════════════════════════════════

export const BADGE_IDS = {
  FIRST_HEARD:   0,
  RADIO_FIND:    1,
  GIFTED:        2,
  SEARCHED:      3,
  SEASONED:      4,   // 30 days
  VINTAGE:       5,   // 1 year
  CLASSIC:       6,   // 3 years
  SHARED:        7,
  CIRCLED:       8,
  TRADED:        9,
  MOST_SENT:     10,
  DEEP_CUT:      11,
  OBSESSED:      12,
  ON_REPEAT:     13,
} as const;

export type BadgeId = typeof BADGE_IDS[keyof typeof BADGE_IDS];

// ═══════════════════════════════════════
// FRAME TIER REGISTRY
// ═══════════════════════════════════════

export const FRAME_TIERS = {
  COMMON:  0,   // default — all cards
  WARM:    1,   // listened 10+ times
  FOIL:    2,   // shared to Close Circle
  CHROMA:  3,   // in collection 30+ days
  LIVING:  4,   // special/awarded
} as const;

export type FrameTier = typeof FRAME_TIERS[keyof typeof FRAME_TIERS];

// ═══════════════════════════════════════
// BADGE MATERIAL TYPES
// ═══════════════════════════════════════

export const BADGE_MATERIALS = {
  MATTE:           0,
  EMBOSS:          1,
  FOIL_STAMP:      2,
  GLOW:            3,
  ANIMATED_ROTATE: 4,
  SCAN_LINE:       5,
  PATINA:          6,
} as const;

export type BadgeMaterial = typeof BADGE_MATERIALS[keyof typeof BADGE_MATERIALS];

// Badge ID → Material mapping
export const BADGE_MATERIAL_MAP: Record<BadgeId, BadgeMaterial> = {
  [BADGE_IDS.SEARCHED]:    BADGE_MATERIALS.MATTE,
  [BADGE_IDS.SHARED]:      BADGE_MATERIALS.MATTE,
  [BADGE_IDS.FIRST_HEARD]: BADGE_MATERIALS.EMBOSS,
  [BADGE_IDS.DEEP_CUT]:    BADGE_MATERIALS.EMBOSS,
  [BADGE_IDS.MOST_SENT]:   BADGE_MATERIALS.FOIL_STAMP,
  [BADGE_IDS.CLASSIC]:     BADGE_MATERIALS.FOIL_STAMP,
  [BADGE_IDS.OBSESSED]:    BADGE_MATERIALS.FOIL_STAMP,
  [BADGE_IDS.GIFTED]:      BADGE_MATERIALS.GLOW,
  [BADGE_IDS.CIRCLED]:     BADGE_MATERIALS.GLOW,
  [BADGE_IDS.ON_REPEAT]:   BADGE_MATERIALS.ANIMATED_ROTATE,
  [BADGE_IDS.RADIO_FIND]:  BADGE_MATERIALS.SCAN_LINE,
  [BADGE_IDS.VINTAGE]:     BADGE_MATERIALS.PATINA,
  [BADGE_IDS.SEASONED]:    BADGE_MATERIALS.PATINA,
  [BADGE_IDS.TRADED]:      BADGE_MATERIALS.MATTE,
};

// ═══════════════════════════════════════
// HEARD CARD MODEL — used for badge/frame evaluation
// ═══════════════════════════════════════

export interface HEARDCard {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverArtUrl: string;
  previewUrl?: string;
  palette?: CardPaletteData;
  waveformData?: number[];
  bpm?: number;

  // Collection metadata
  createdAt: string;
  daysInCollection: number;
  addedVia: 'search' | 'gift' | 'radio' | 'scan';
  isFirstEver: boolean;

  // Social
  sharedToCircle: boolean;
  circleCount: number;
  traded: boolean;
  sharedCount: number;

  // Listening
  listenCount: number;
  isOnRepeat: boolean;

  // Special
  isSpecial: boolean;
  isPinned: boolean;
  isFavorite: boolean;
  senderPalette?: CardPaletteData;

  // Metadata
  genre?: string;
  year?: number;
  duration?: number;
  mood?: string;
  tags?: string[];
  notes?: string;
  memory?: string;
  location?: string;
  rating?: number;
}

export interface HEARDUser {
  id: string;
  displayName: string;
  cardCount: number;
}

// ═══════════════════════════════════════
// GPU CONTEXT TYPES
// ═══════════════════════════════════════

export interface GPUContextState {
  device: GPUDevice | null;
  isAvailable: boolean;
  isReducedMotion: boolean;
  isBatteryLow: boolean;
}

// Design constraint colors — ONLY hardcoded colors allowed
export const HEARD_BG = '#0E0E10';
export const HEARD_TEXT = '#F0EEE9';
