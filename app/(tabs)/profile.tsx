import { View, Text, StyleSheet } from 'react-native';
import { useCollectionStore } from '../../src/stores/collection-store';
import { tokens } from '../../src/theme/tokens';

export default function ProfileScreen() {
  const { cards } = useCollectionStore();
  const totalListens = cards.reduce((sum, c) => sum + c.listenCount, 0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{cards.length}</Text>
          <Text style={styles.statLabel}>Cards</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalListens}</Text>
          <Text style={styles.statLabel}>Listens</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
    paddingTop: tokens.spacing.xxl,
    alignItems: 'center',
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    fontWeight: '700',
    color: tokens.colors.text,
    marginBottom: tokens.spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: tokens.spacing.xxl,
  },
  statItem: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  statValue: {
    fontFamily: tokens.fonts.display,
    fontSize: 32,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  statLabel: {
    fontFamily: tokens.fonts.body,
    fontSize: 14,
    color: tokens.colors.textMuted,
  },
});
