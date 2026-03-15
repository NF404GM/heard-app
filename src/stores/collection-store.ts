import { create } from 'zustand';
import type { HEARDCard } from '../gpu/types/gpu.types';

interface CollectionState {
  cards: HEARDCard[];
  isLoading: boolean;
  addCard: (card: HEARDCard) => void;
  removeCard: (id: string) => void;
  getCard: (id: string) => HEARDCard | undefined;
  setCards: (cards: HEARDCard[]) => void;
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  cards: [],
  isLoading: false,

  addCard: (card) =>
    set((state) => ({
      cards: [card, ...state.cards],
    })),

  removeCard: (id) =>
    set((state) => ({
      cards: state.cards.filter((c) => c.id !== id),
    })),

  getCard: (id) => get().cards.find((c) => c.id === id),

  setCards: (cards) => set({ cards, isLoading: false }),
}));
