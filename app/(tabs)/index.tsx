import { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { HeardCard } from '../../src/components/card/heard-card';
import { useCollectionStore } from '../../src/stores/collection-store';
import { usePlaybackStore } from '../../src/stores/playback-store';
import { MOCK_CARDS } from '../../src/lib/mock-data';
import { tokens } from '../../src/theme/tokens';
import type { HEARDCard } from '../../src/gpu/types/gpu.types';

export default function CollectionScreen() {
  const router = useRouter();
  const { cards, setCards, isLoading } = useCollectionStore();
  const { currentCardId, isPlaying, playbackTime } = usePlaybackStore();

  // Load mock data on mount
  useEffect(() => {
    if (cards.length === 0) {
      setCards(MOCK_CARDS);
    }
  }, []);

  const handleCardPress = (card: HEARDCard) => {
    router.push(`/card/${card.id}`);
  };

  const renderCard = ({ item }: { item: HEARDCard }) => (
    <View style={styles.cardWrapper}>
      <HeardCard
        card={item}
        onPress={() => handleCardPress(item)}
        isPlaying={currentCardId === item.id && isPlaying}
        playbackTime={currentCardId === item.id ? playbackTime : 0}
      />
    </View>
  );

  if (cards.length === 0 && !isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No cards yet</Text>
        <Text style={styles.emptySubtitle}>
          Search for songs to start your collection
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={cards}
        renderItem={renderCard}
        keyExtractor={(item) => item.id}
        numColumns={1}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={styles.header}>My Collection</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
  },
  listContent: {
    alignItems: 'center',
    paddingBottom: tokens.spacing.xxl,
  },
  cardWrapper: {
    marginBottom: tokens.spacing.md,
  },
  header: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    fontWeight: '700',
    color: tokens.colors.text,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
    alignSelf: 'flex-start',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing.xl,
  },
  emptyTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: tokens.spacing.sm,
  },
  emptySubtitle: {
    fontFamily: tokens.fonts.body,
    fontSize: 15,
    color: tokens.colors.textMuted,
    textAlign: 'center',
  },
});
