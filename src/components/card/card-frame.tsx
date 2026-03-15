import { View, StyleSheet } from 'react-native';
import type { CardPaletteData, FrameTier } from '../../gpu/types/gpu.types';
import { getStaticFrameStyle } from '../../gpu/fallbacks/staticFrame';
import { tokens } from '../../theme/tokens';

interface CardFrameProps {
  children: React.ReactNode;
  tier: FrameTier;
  palette: CardPaletteData | null;
  isGPU?: boolean;
}

export function CardFrame({ children, tier, palette, isGPU = false }: CardFrameProps) {
  // If GPU is handling the frame, just use a minimal wrapper
  if (isGPU) {
    return (
      <View style={styles.container}>
        {children}
      </View>
    );
  }

  // CSS fallback
  const frameStyle = getStaticFrameStyle(tier, palette);

  return (
    <View
      style={[
        styles.container,
        {
          borderWidth: frameStyle.borderWidth,
          borderColor: frameStyle.borderColor,
          borderRadius: frameStyle.borderRadius,
          shadowColor: frameStyle.shadowColor,
          shadowOffset: frameStyle.shadowOffset,
          shadowOpacity: frameStyle.shadowOpacity,
          shadowRadius: frameStyle.shadowRadius,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: tokens.card.width,
    height: tokens.card.height,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surface,
    overflow: 'hidden',
  },
});
