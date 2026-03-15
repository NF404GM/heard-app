import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useGPUCard } from '../../gpu/hooks/useGPUCard';
import { useEffectTier } from '../../gpu/context';
import { getFrameTier } from '../../gpu/pipelines/cardRenderPipeline';
import type { HEARDCard, FrameTier } from '../../gpu/types/gpu.types';
import { CardFront } from './card-front';
import { CardBack } from './card-back';
import { CardFrame } from './card-frame';
import { tokens } from '../../theme/tokens';

interface HeardCardProps {
  card: HEARDCard;
  onPress?: () => void;
  isPlaying?: boolean;
  playbackTime?: number;
}

export function HeardCard({ card, onPress, isPlaying, playbackTime }: HeardCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const effectTier = useEffectTier();

  const {
    canvasRef,
    isGPUReady,
    palette,
    frameTier,
    flipProgress,
    triggerFlip,
  } = useGPUCard({
    card,
    isFlipping: isFlipped,
    isPlaying,
    playbackTime,
  });

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    triggerFlip();
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      handleFlip();
    }
  };

  const isGPU = effectTier !== 'fallback' && isGPUReady;
  const displayPalette = palette ?? card.palette ?? null;
  const tier = (frameTier ?? getFrameTier(card)) as FrameTier;

  return (
    <Pressable onPress={handlePress} style={styles.pressable}>
      <CardFrame tier={tier} palette={displayPalette} isGPU={isGPU}>
        {/* GPU Canvas layer (invisible infrastructure) */}
        {isGPU && (
          <View ref={canvasRef} style={StyleSheet.absoluteFill} pointerEvents="none" />
        )}

        {/* Content layer — always on top */}
        {!isFlipped ? (
          <CardFront card={card} palette={displayPalette} />
        ) : (
          <CardBack card={card} palette={displayPalette} />
        )}
      </CardFrame>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: tokens.card.width,
    height: tokens.card.height,
  },
});
