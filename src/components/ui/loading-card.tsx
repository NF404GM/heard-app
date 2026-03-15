import { View, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';

export function LoadingCard() {
  return (
    <View style={styles.container}>
      {/* Album art skeleton */}
      <View style={styles.artSkeleton} />
      {/* Title skeleton */}
      <View style={styles.titleSkeleton} />
      {/* Artist skeleton */}
      <View style={styles.artistSkeleton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: tokens.card.width,
    height: tokens.card.height,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surface,
    padding: tokens.spacing.md,
    alignItems: 'center',
    paddingTop: tokens.spacing.md,
  },
  artSkeleton: {
    width: tokens.card.artSize,
    height: tokens.card.artSize,
    borderRadius: 12,
    backgroundColor: tokens.colors.surfaceLight,
  },
  titleSkeleton: {
    width: '70%',
    height: 18,
    borderRadius: 4,
    backgroundColor: tokens.colors.surfaceLight,
    marginTop: tokens.spacing.sm,
  },
  artistSkeleton: {
    width: '50%',
    height: 14,
    borderRadius: 4,
    backgroundColor: tokens.colors.surfaceLight,
    marginTop: tokens.spacing.xs,
  },
});
