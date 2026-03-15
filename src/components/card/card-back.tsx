import { View, Text, ScrollView, StyleSheet } from 'react-native';
import type { HEARDCard, CardPaletteData } from '../../gpu/types/gpu.types';
import { tokens } from '../../theme/tokens';

interface CardBackProps {
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

function formatAddedVia(via: HEARDCard['addedVia']): string {
  switch (via) {
    case 'search': return 'Found via search';
    case 'gift': return 'A gift';
    case 'radio': return 'Discovered on Radio';
    case 'scan': return 'Scanned';
  }
}

export function CardBack({ card, palette }: CardBackProps) {
  const accentColor = palette ? vec4ToRGBA(palette.accent) : tokens.colors.gold;
  const mutedColor = palette ? vec4ToRGBA(palette.muted, 0.7) : tokens.colors.textMuted;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Story / Memory */}
      {card.memory && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: accentColor }]}>Your Story</Text>
          <Text style={styles.memoryText}>{card.memory}</Text>
        </View>
      )}

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{card.listenCount}</Text>
          <Text style={[styles.statLabel, { color: mutedColor }]}>Listens</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{card.daysInCollection}</Text>
          <Text style={[styles.statLabel, { color: mutedColor }]}>Days</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{card.sharedCount}</Text>
          <Text style={[styles.statLabel, { color: mutedColor }]}>Shared</Text>
        </View>
      </View>

      {/* Tags */}
      {card.tags && card.tags.length > 0 && (
        <View style={styles.section}>
          <View style={styles.tagRow}>
            {card.tags.map((tag) => (
              <View
                key={tag}
                style={[styles.tag, { borderColor: accentColor }]}
              >
                <Text style={[styles.tagText, { color: accentColor }]}>{tag}</Text>
              </View>
            ))}
            {card.genre && (
              <View style={[styles.tag, { borderColor: mutedColor }]}>
                <Text style={[styles.tagText, { color: mutedColor }]}>{card.genre}</Text>
              </View>
            )}
            {card.year && (
              <View style={[styles.tag, { borderColor: mutedColor }]}>
                <Text style={[styles.tagText, { color: mutedColor }]}>{card.year}</Text>
              </View>
            )}
            {card.mood && (
              <View style={[styles.tag, { borderColor: mutedColor }]}>
                <Text style={[styles.tagText, { color: mutedColor }]}>{card.mood}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* How it was added */}
      <View style={styles.section}>
        <Text style={[styles.addedVia, { color: mutedColor }]}>
          {formatAddedVia(card.addedVia)}
        </Text>
      </View>

      {/* Notes */}
      {card.notes && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: accentColor }]}>Notes</Text>
          <Text style={styles.notesText}>{card.notes}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: tokens.spacing.md,
    paddingTop: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  section: {
    gap: tokens.spacing.xs,
  },
  sectionTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  memoryText: {
    fontFamily: tokens.fonts.editorial,
    fontSize: 15,
    fontStyle: 'italic',
    color: tokens.colors.text,
    lineHeight: 22,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: tokens.spacing.sm,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  statLabel: {
    fontFamily: tokens.fonts.body,
    fontSize: 11,
    color: tokens.colors.textMuted,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  tag: {
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 3,
  },
  tagText: {
    fontFamily: tokens.fonts.body,
    fontSize: 12,
  },
  addedVia: {
    fontFamily: tokens.fonts.body,
    fontSize: 12,
    fontStyle: 'italic',
  },
  notesText: {
    fontFamily: tokens.fonts.body,
    fontSize: 14,
    color: tokens.colors.text,
    lineHeight: 20,
  },
});
