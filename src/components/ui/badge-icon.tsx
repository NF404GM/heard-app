import { View, Text, StyleSheet } from 'react-native';
import type { HEARDCard, CardPaletteData, BadgeId } from '../../gpu/types/gpu.types';
import { BADGE_IDS } from '../../gpu/types/gpu.types';
import { getBadgeName } from '../../badges/badgeEvaluator';
import { tokens } from '../../theme/tokens';

interface BadgeIconProps {
  card: HEARDCard;
  palette: CardPaletteData | null;
}

function vec4ToRGBA(v: { x: number; y: number; z: number; w: number }, alpha: number): string {
  const r = Math.round(v.x * 255);
  const g = Math.round(v.y * 255);
  const b = Math.round(v.z * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Simple badge emoji mapping
const BADGE_EMOJI: Record<number, string> = {
  [BADGE_IDS.FIRST_HEARD]: '\u2B50',
  [BADGE_IDS.RADIO_FIND]: '\uD83D\uDCE1',
  [BADGE_IDS.GIFTED]: '\uD83C\uDF81',
  [BADGE_IDS.SEARCHED]: '\uD83D\uDD0D',
  [BADGE_IDS.SEASONED]: '\uD83C\uDF3F',
  [BADGE_IDS.VINTAGE]: '\uD83C\uDFB5',
  [BADGE_IDS.CLASSIC]: '\uD83C\uDFC6',
  [BADGE_IDS.SHARED]: '\u2194\uFE0F',
  [BADGE_IDS.CIRCLED]: '\u2B55',
  [BADGE_IDS.TRADED]: '\uD83D\uDD04',
  [BADGE_IDS.MOST_SENT]: '\uD83D\uDE80',
  [BADGE_IDS.DEEP_CUT]: '\uD83D\uDC8E',
  [BADGE_IDS.OBSESSED]: '\uD83D\uDD25',
  [BADGE_IDS.ON_REPEAT]: '\uD83D\uDD01',
};

function getEarnedBadgeIds(card: HEARDCard): BadgeId[] {
  const badges: BadgeId[] = [];
  if (card.isFirstEver) badges.push(BADGE_IDS.FIRST_HEARD);
  if (card.addedVia === 'radio') badges.push(BADGE_IDS.RADIO_FIND);
  if (card.addedVia === 'gift') badges.push(BADGE_IDS.GIFTED);
  if (card.addedVia === 'search') badges.push(BADGE_IDS.SEARCHED);
  if (card.daysInCollection >= 1095) badges.push(BADGE_IDS.CLASSIC);
  else if (card.daysInCollection >= 365) badges.push(BADGE_IDS.VINTAGE);
  else if (card.daysInCollection >= 30) badges.push(BADGE_IDS.SEASONED);
  if (card.listenCount >= 100) badges.push(BADGE_IDS.OBSESSED);
  if (card.isOnRepeat) badges.push(BADGE_IDS.ON_REPEAT);
  if (card.listenCount >= 50 && card.sharedCount === 0) badges.push(BADGE_IDS.DEEP_CUT);
  if (card.sharedToCircle) badges.push(BADGE_IDS.CIRCLED);
  if (card.traded) badges.push(BADGE_IDS.TRADED);
  if (card.sharedCount > 0) badges.push(BADGE_IDS.SHARED);
  return badges.slice(0, 4); // Show max 4 in corner
}

export function BadgeIcon({ card, palette }: BadgeIconProps) {
  const badges = getEarnedBadgeIds(card);
  if (badges.length === 0) return null;

  const badgeColor = palette
    ? vec4ToRGBA(palette.accent, 0.9)
    : tokens.colors.gold;

  return (
    <View style={styles.container}>
      {badges.map((badgeId) => (
        <View key={badgeId} style={[styles.badge, { borderColor: badgeColor }]}>
          <Text style={styles.badgeEmoji}>{BADGE_EMOJI[badgeId] ?? '\u2022'}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: tokens.radius.badge,
    borderWidth: 1,
    backgroundColor: `${tokens.colors.surface}CC`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEmoji: {
    fontSize: 12,
  },
});
