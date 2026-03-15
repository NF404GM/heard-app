import { create } from 'zustand';
import type { HEARDCard } from '../gpu/types/gpu.types';

interface CircleMember {
  id: string;
  displayName: string;
}

interface CircleState {
  members: CircleMember[];
  sharedCards: HEARDCard[];
  addMember: (member: CircleMember) => void;
  shareCard: (card: HEARDCard) => void;
}

export const useCircleStore = create<CircleState>((set) => ({
  members: [],
  sharedCards: [],

  addMember: (member) =>
    set((state) => ({
      members: [...state.members, member],
    })),

  shareCard: (card) =>
    set((state) => ({
      sharedCards: [card, ...state.sharedCards],
    })),
}));
