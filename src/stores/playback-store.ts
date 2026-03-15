import { create } from 'zustand';

interface PlaybackState {
  currentCardId: string | null;
  isPlaying: boolean;
  playbackTime: number;
  play: (cardId: string) => void;
  pause: () => void;
  seek: (time: number) => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  currentCardId: null,
  isPlaying: false,
  playbackTime: 0,

  play: (cardId) =>
    set({
      currentCardId: cardId,
      isPlaying: true,
      playbackTime: 0,
    }),

  pause: () => set({ isPlaying: false }),

  seek: (time) => set({ playbackTime: time }),
}));
