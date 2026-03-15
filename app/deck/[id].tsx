import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { tokens } from '../../src/theme/tokens';

export default function DeckViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Deck</Text>
      <Text style={styles.subtitle}>Deck {id} coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 24,
    fontWeight: '700',
    color: tokens.colors.text,
    marginBottom: tokens.spacing.sm,
  },
  subtitle: {
    fontFamily: tokens.fonts.body,
    fontSize: 15,
    color: tokens.colors.textMuted,
  },
});
