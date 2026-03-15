/**
 * HEARD — Badge Evaluator
 * Determines which badges a card has earned based on its metadata.
 *
 * Pure TypeScript logic — no GPU dependency.
 * Returns BadgeSlotData[] ready to feed into the badge compositor.
 *
 * Badge unlock criteria:
 *   FIRST_HEARD   — card.isFirstEver
 *   RADIO_FIND     — card.addedVia === 'radio'
 *   GIFTED         — card.addedVia === 'gift'
 *   SEARCHED       — card.addedVia === 'search'
 *   SEASONED       — card.daysInCollection >= 30
 *   VINTAGE        — card.daysInCollection >= 365
 *   CLASSIC        — card.daysInCollection >= 1095 (3 years)
 *   SHARED         — card.sharedCount > 0
 *   CIRCLED        — card.sharedToCircle
 *   TRADED         — card.traded
 *   MOST_SENT      — determined externally (user-level stat)
 *   DEEP_CUT       — card.listenCount >= 50 && card.sharedCount === 0
 *   OBSESSED       — card.listenCount >= 100
 *   ON_REPEAT      — card.isOnRepeat
 */
import {
  BADGE_IDS,
  BADGE_MATERIAL_MAP,
  type BadgeId,
  type BadgeSlotData,
  type CardPaletteData,
  type HEARDCard,
  type HEARDUser,
} from '../gpu/types/gpu.types';
import { computeBadgeLayout } from '../gpu/shaders/badge/compositor';

// ═══════════════════════════════════════
// Badge Rule Definitions
// ═══════════════════════════════════════

interface BadgeRule {
  id: BadgeId;
  /** Return true if the card qualifies for this badge */
  test: (card: HEARDCard, user: HEARDUser) => boolean;
  /** Priority for display ordering (higher = shown first) */
  priority: number;
}

const BADGE_RULES: BadgeRule[] = [
  {
    id: BADGE_IDS.FIRST_HEARD,
    test: (card) => card.isFirstEver,
    priority: 100,
  },
  {
    id: BADGE_IDS.CLASSIC,
    test: (card) => card.daysInCollection >= 1095,
    priority: 90,
  },
  {
    id: BADGE_IDS.VINTAGE,
    test: (card) => card.daysInCollection >= 365,
    priority: 85,
  },
  {
    id: BADGE_IDS.SEASONED,
    test: (card) => card.daysInCollection >= 30,
    priority: 80,
  },
  {
    id: BADGE_IDS.OBSESSED,
    test: (card) => card.listenCount >= 100,
    priority: 75,
  },
  {
    id: BADGE_IDS.ON_REPEAT,
    test: (card) => card.isOnRepeat,
    priority: 70,
  },
  {
    id: BADGE_IDS.DEEP_CUT,
    test: (card) => card.listenCount >= 50 && card.sharedCount === 0,
    priority: 65,
  },
  {
    id: BADGE_IDS.CIRCLED,
    test: (card) => card.sharedToCircle,
    priority: 60,
  },
  {
    id: BADGE_IDS.TRADED,
    test: (card) => card.traded,
    priority: 55,
  },
  {
    id: BADGE_IDS.SHARED,
    test: (card) => card.sharedCount > 0,
    priority: 50,
  },
  {
    id: BADGE_IDS.GIFTED,
    test: (card) => card.addedVia === 'gift',
    priority: 45,
  },
  {
    id: BADGE_IDS.RADIO_FIND,
    test: (card) => card.addedVia === 'radio',
    priority: 40,
  },
  {
    id: BADGE_IDS.SEARCHED,
    test: (card) => card.addedVia === 'search',
    priority: 35,
  },
  // MOST_SENT is evaluated externally; included here for completeness
  // but test always returns false — set via addExternalBadge() below
  {
    id: BADGE_IDS.MOST_SENT,
    test: () => false,
    priority: 95,
  },
];

// ═══════════════════════════════════════
// Badge Color Derivation
// ═══════════════════════════════════════

/**
 * Derive badge base color from palette based on badge type.
 * - Gift/social badges use accent
 * - Time-based badges use muted
 * - Special badges use dominant
 * - If card has senderPalette (gifted), use sender's accent for that badge
 */
function badgeColor(badgeId: BadgeId, card: HEARDCard, palette: CardPaletteData): { x: number; y: number; z: number; w: number } {
  // Gifted badge uses sender palette accent if available
  if (badgeId === BADGE_IDS.GIFTED && card.senderPalette) {
    return card.senderPalette.accent;
  }

  // Social/interaction badges: accent color
  if (
    badgeId === BADGE_IDS.SHARED ||
    badgeId === BADGE_IDS.CIRCLED ||
    badgeId === BADGE_IDS.TRADED ||
    badgeId === BADGE_IDS.GIFTED ||
    badgeId === BADGE_IDS.MOST_SENT
  ) {
    return palette.accent;
  }

  // Time-based badges: muted color
  if (
    badgeId === BADGE_IDS.SEASONED ||
    badgeId === BADGE_IDS.VINTAGE ||
    badgeId === BADGE_IDS.CLASSIC
  ) {
    return palette.muted;
  }

  // Listen-based badges: dominant shifted slightly brighter
  if (
    badgeId === BADGE_IDS.OBSESSED ||
    badgeId === BADGE_IDS.ON_REPEAT ||
    badgeId === BADGE_IDS.DEEP_CUT
  ) {
    return {
      x: Math.min(palette.dominant.x * 1.2, 1),
      y: Math.min(palette.dominant.y * 1.2, 1),
      z: Math.min(palette.dominant.z * 1.2, 1),
      w: palette.dominant.w,
    };
  }

  // Default: dominant
  return palette.dominant;
}

// ═══════════════════════════════════════
// Main Evaluator
// ═══════════════════════════════════════

/**
 * Evaluate which badges a card has earned and return slot data
 * ready for the badge compositor pipeline.
 *
 * @param card - The HEARD card to evaluate
 * @param user - The card owner
 * @param palette - Extracted card palette (for badge coloring)
 * @param cardWidth - Card width in pixels (for layout)
 * @param cardHeight - Card height in pixels (for layout)
 * @param externalBadgeIds - Badges granted by external systems (e.g. MOST_SENT)
 */
export function evaluateBadges(
  card: HEARDCard,
  user: HEARDUser,
  palette: CardPaletteData,
  cardWidth: number,
  cardHeight: number,
  externalBadgeIds: BadgeId[] = [],
): BadgeSlotData[] {
  // Evaluate all rules
  const earned: BadgeId[] = [];

  for (const rule of BADGE_RULES) {
    if (rule.test(card, user)) {
      earned.push(rule.id);
    }
  }

  // Add externally granted badges
  for (const extId of externalBadgeIds) {
    if (!earned.includes(extId)) {
      earned.push(extId);
    }
  }

  // Sort by priority (highest first)
  earned.sort((a, b) => {
    const prioA = BADGE_RULES.find((r) => r.id === a)?.priority ?? 0;
    const prioB = BADGE_RULES.find((r) => r.id === b)?.priority ?? 0;
    return prioB - prioA;
  });

  // Compute layout positions
  const layout = computeBadgeLayout(earned.length, cardWidth, cardHeight);

  // Build BadgeSlotData array (max 8 slots)
  const slots: BadgeSlotData[] = [];
  const slotCount = Math.min(earned.length, 8);

  for (let i = 0; i < slotCount; i++) {
    const badgeId = earned[i];
    const layoutSlot = i < layout.length ? layout[i] : layout[layout.length - 1];
    const materialId = BADGE_MATERIAL_MAP[badgeId] ?? 0;

    slots.push({
      badgeId,
      position: { x: layoutSlot.position.x, y: layoutSlot.position.y },
      scale: layoutSlot.isOverflow ? 0.8 : 1.0,
      color: badgeColor(badgeId, card, palette),
      animPhase: i * 0.3, // stagger animations by 0.3s per badge
      visible: 1,
    });
  }

  return slots;
}

/**
 * Quick check: does this card have any badges?
 * Useful for skipping the compositor entirely when there are none.
 */
export function hasBadges(card: HEARDCard, user: HEARDUser): boolean {
  return BADGE_RULES.some((rule) => rule.test(card, user));
}

/**
 * Get human-readable badge name for UI display.
 */
export function getBadgeName(badgeId: BadgeId): string {
  const names: Record<number, string> = {
    [BADGE_IDS.FIRST_HEARD]: 'First Heard',
    [BADGE_IDS.RADIO_FIND]: 'Radio Find',
    [BADGE_IDS.GIFTED]: 'Gifted',
    [BADGE_IDS.SEARCHED]: 'Searched',
    [BADGE_IDS.SEASONED]: 'Seasoned',
    [BADGE_IDS.VINTAGE]: 'Vintage',
    [BADGE_IDS.CLASSIC]: 'Classic',
    [BADGE_IDS.SHARED]: 'Shared',
    [BADGE_IDS.CIRCLED]: 'Circled',
    [BADGE_IDS.TRADED]: 'Traded',
    [BADGE_IDS.MOST_SENT]: 'Most Sent',
    [BADGE_IDS.DEEP_CUT]: 'Deep Cut',
    [BADGE_IDS.OBSESSED]: 'Obsessed',
    [BADGE_IDS.ON_REPEAT]: 'On Repeat',
  };
  return names[badgeId] ?? 'Unknown';
}
