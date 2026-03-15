import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../src/theme/tokens';

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Explore</Text>
      <Text style={styles.subtitle}>Discover new music from your circle and beyond</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing.xl,
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
    textAlign: 'center',
  },
});
