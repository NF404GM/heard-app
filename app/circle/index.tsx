import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useCircleStore } from '../../src/stores/circle-store';
import { tokens } from '../../src/theme/tokens';

export default function CircleScreen() {
  const { members, sharedCards } = useCircleStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Close Circle</Text>

      {members.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Your circle is empty</Text>
          <Text style={styles.emptySubtitle}>
            Add friends to share cards and see what they're listening to
          </Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.memberRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.memberName}>{item.displayName}</Text>
            </View>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
    paddingTop: tokens.spacing.lg,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    fontWeight: '700',
    color: tokens.colors.text,
    paddingHorizontal: tokens.spacing.lg,
    marginBottom: tokens.spacing.lg,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing.xl,
  },
  emptyTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
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
  listContent: {
    paddingHorizontal: tokens.spacing.lg,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  memberName: {
    fontFamily: tokens.fonts.body,
    fontSize: 16,
    color: tokens.colors.text,
  },
});
