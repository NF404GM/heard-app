import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { HEARDCard, CardPaletteData } from '../../gpu/types/gpu.types';
import { WaveformBar } from '../waveform/waveform-bar';
import { BadgeIcon } from '../ui/badge-icon';
import { tokens } from '../../theme/tokens';
import { evaluateBadges, getBadgeName } from '../../badges/badgeEvaluator';

interface CardFrontProps {
  card: HEARDCard;
  palette: CardPaletteData | null;
}

function vec4ToRGBA(v: { x: number; y: number; z: number; w: number }, alpha?: number): string {
  const r = Math.round(v.x * 255);
  const g = Math.round(v.y * 255);
  const b = Math.round(v.z * 255);
  const a = alpha ?? v.w;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function CardFront({ card, palette }: CardFrontProps) {
  const mutedColor = palette ? vec4ToRGBA(palette.muted, 0.8) : tokens.colors.textMuted;

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: card.coverArtUrl }}
        style={styles.albumArt}
        contentFit="cover"
        transition={200}
      />

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {card.title}
        </Text>
        <Text style={[styles.artist, { color: mutedColor }]} numberOfLines={1}>
          {card.artist}
        </Text>
      </View>

      {card.waveformData && card.waveformData.length > 0 && (
        <View style={styles.waveformContainer}>
          <WaveformBar
            data={card.waveformData}
            palette={palette}
            width={tokens.card.artSize}
            height={32}
          />
        </View>
      )}

      {card.palette && (
        <View style={styles.badgeRow}>
          <BadgeIcon card={card} palette={palette} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
  },
  albumArt: {
    width: tokens.card.artSize,
    height: tokens.card.artSize,
    borderRadius: 12,
  },
  info: {
    width: '100%',
    marginTop: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xs,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  artist: {
    fontFamily: tokens.fonts.body,
    fontSize: 14,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  waveformContainer: {
    marginTop: tokens.spacing.sm,
    width: tokens.card.artSize,
  },
  badgeRow: {
    position: 'absolute',
    bottom: tokens.spacing.md,
    right: tokens.spacing.md,
    flexDirection: 'row',
    gap: 4,
  },
});
