import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HeardCard } from '../../src/components/card/heard-card';
import { useCollectionStore } from '../../src/stores/collection-store';
import { usePlaybackStore } from '../../src/stores/playback-store';
import { tokens } from '../../src/theme/tokens';

const { width: screenWidth } = Dimensions.get('window');

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getCard } = useCollectionStore();
  const { play, pause, isPlaying, currentCardId } = usePlaybackStore();

  const card = getCard(id);

  if (!card) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFound}>Card not found</Text>
      </View>
    );
  }

  const isCurrentPlaying = currentCardId === card.id && isPlaying;

  const handlePlayPause = () => {
    if (isCurrentPlaying) {
      pause();
    } else {
      play(card.id);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.cardContainer}>
        <HeardCard
          card={card}
          isPlaying={isCurrentPlaying}
        />
      </View>

      <View style={styles.metadata}>
        <Text style={styles.title}>{card.title}</Text>
        <Text style={styles.artist}>{card.artist}</Text>
        <Text style={styles.album}>{card.album}</Text>
      </View>

      <View style={styles.actions}>
        {card.previewUrl && (
          <Pressable
            onPress={handlePlayPause}
            style={styles.playButton}
          >
            <Text style={styles.playButtonText}>
              {isCurrentPlaying ? 'Pause' : 'Play Preview'}
            </Text>
          </Pressable>
        )}

        <View style={styles.secondaryActions}>
          <Pressable style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Share</Text>
          </Pressable>
          <Pressable style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Add to Deck</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
    alignItems: 'center',
    paddingTop: tokens.spacing.lg,
  },
  cardContainer: {
    alignItems: 'center',
  },
  metadata: {
    alignItems: 'center',
    marginTop: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.xl,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  artist: {
    fontFamily: tokens.fonts.body,
    fontSize: 16,
    color: tokens.colors.textMuted,
    marginTop: tokens.spacing.xs,
  },
  album: {
    fontFamily: tokens.fonts.body,
    fontSize: 14,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  actions: {
    marginTop: tokens.spacing.lg,
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  playButton: {
    backgroundColor: tokens.colors.action,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.button,
  },
  playButtonText: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '600',
    color: tokens.colors.bg,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: tokens.colors.surfaceLight,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.button,
  },
  actionButtonText: {
    fontFamily: tokens.fonts.body,
    fontSize: 14,
    color: tokens.colors.text,
  },
  notFound: {
    fontFamily: tokens.fonts.body,
    fontSize: 16,
    color: tokens.colors.textMuted,
  },
});
