import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import type { HEARDCard } from '../../gpu/types/gpu.types';
import { tokens } from '../../theme/tokens';

interface DeckCoverProps {
  title: string;
  cards: HEARDCard[];
}

export function DeckCover({ title, cards }: DeckCoverProps) {
  const mosaicCards = cards.slice(0, 4);
  const cardCount = cards.length;

  return (
    <View style={styles.container}>
      <View style={styles.mosaic}>
        {mosaicCards.map((card, index) => (
          <Image
            key={card.id}
            source={{ uri: card.coverArtUrl }}
            style={[
              styles.mosaicImage,
              {
                top: index < 2 ? 0 : '50%',
                left: index % 2 === 0 ? 0 : '50%',
              },
            ]}
            contentFit="cover"
          />
        ))}
        {mosaicCards.length === 0 && (
          <View style={styles.emptyMosaic} />
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.count}>
        {cardCount} {cardCount === 1 ? 'card' : 'cards'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 160,
    gap: tokens.spacing.xs,
  },
  mosaic: {
    width: 160,
    height: 160,
    borderRadius: tokens.radius.card,
    overflow: 'hidden',
    backgroundColor: tokens.colors.surface,
    position: 'relative',
  },
  mosaicImage: {
    position: 'absolute',
    width: '50%',
    height: '50%',
  },
  emptyMosaic: {
    flex: 1,
    backgroundColor: tokens.colors.surfaceLight,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  count: {
    fontFamily: tokens.fonts.body,
    fontSize: 12,
    color: tokens.colors.textMuted,
  },
});
