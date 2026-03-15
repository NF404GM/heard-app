import type { HEARDCard, CardPaletteData } from '../gpu/types/gpu.types';

// Helper to create palette data
function palette(
  dominant: [number, number, number],
  shadow: [number, number, number],
  accent: [number, number, number],
  muted: [number, number, number],
  warmth: number,
): CardPaletteData {
  return {
    dominant: { x: dominant[0], y: dominant[1], z: dominant[2], w: 1.0 },
    shadow: { x: shadow[0], y: shadow[1], z: shadow[2], w: 1.0 },
    accent: { x: accent[0], y: accent[1], z: accent[2], w: 1.0 },
    muted: { x: muted[0], y: muted[1], z: muted[2], w: 0.6 },
    warmth,
  };
}

// Generate simple waveform data
function generateWaveform(seed: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < 512; i++) {
    const t = i / 512;
    data.push(
      Math.abs(Math.sin(t * Math.PI * seed) * 0.7 + Math.sin(t * Math.PI * seed * 3) * 0.3),
    );
  }
  return data;
}

export const MOCK_CARDS: HEARDCard[] = [
  // Card 1: All fields, high listen count, Living frame tier
  {
    id: 'card-001',
    title: 'Runaway',
    artist: 'Kanye West',
    album: 'My Beautiful Dark Twisted Fantasy',
    coverArtUrl: 'https://i.scdn.co/image/ab67616d0000b2731c5eacf6965d328e5bb7c22a',
    previewUrl: 'https://p.scdn.co/mp3-preview/example1',
    palette: palette(
      [0.75, 0.25, 0.15], [0.3, 0.1, 0.05], [0.95, 0.8, 0.3], [0.5, 0.2, 0.1], 0.85,
    ),
    waveformData: generateWaveform(7),
    bpm: 84,
    createdAt: '2023-01-15T00:00:00Z',
    daysInCollection: 1155,
    addedVia: 'search',
    isFirstEver: true,
    sharedToCircle: true,
    circleCount: 5,
    traded: false,
    sharedCount: 12,
    listenCount: 347,
    isOnRepeat: false,
    isSpecial: true,
    isPinned: true,
    isFavorite: true,
    genre: 'Hip-Hop',
    year: 2010,
    duration: 567,
    mood: 'Melancholic',
    tags: ['hip-hop', 'kanye', 'classic', 'epic'],
    notes: 'The first song I ever added to HEARD.',
    memory: 'I was driving through the desert at sunset when this came on. The piano intro hit different that day — everything felt possible and nothing mattered at the same time.',
    location: 'Joshua Tree, CA',
    rating: 5,
  },

  // Card 2: Recently added via search, Common frame
  {
    id: 'card-002',
    title: 'Not Like Us',
    artist: 'Kendrick Lamar',
    album: 'GNX',
    coverArtUrl: 'https://i.scdn.co/image/ab67616d0000b273d9985092cd88bffd97653b58',
    previewUrl: 'https://p.scdn.co/mp3-preview/example2',
    palette: palette(
      [0.1, 0.1, 0.1], [0.05, 0.05, 0.05], [0.9, 0.2, 0.2], [0.15, 0.15, 0.15], 0.3,
    ),
    waveformData: generateWaveform(12),
    bpm: 101,
    createdAt: '2026-03-01T00:00:00Z',
    daysInCollection: 14,
    addedVia: 'search',
    isFirstEver: false,
    sharedToCircle: false,
    circleCount: 0,
    traded: false,
    sharedCount: 0,
    listenCount: 8,
    isOnRepeat: false,
    isSpecial: false,
    isPinned: false,
    isFavorite: false,
    genre: 'Hip-Hop',
    year: 2024,
    duration: 274,
    mood: 'Aggressive',
    tags: ['hip-hop', 'kendrick', 'west-coast'],
  },

  // Card 3: Gifted card with sender palette, Foil frame
  {
    id: 'card-003',
    title: 'Pink + White',
    artist: 'Frank Ocean',
    album: 'Blonde',
    coverArtUrl: 'https://i.scdn.co/image/ab67616d0000b273c5649add07ed3720be9d5526',
    palette: palette(
      [0.95, 0.6, 0.4], [0.6, 0.3, 0.2], [0.4, 0.7, 0.95], [0.8, 0.5, 0.35], 0.75,
    ),
    waveformData: generateWaveform(5),
    bpm: 80,
    createdAt: '2025-06-20T00:00:00Z',
    daysInCollection: 268,
    addedVia: 'gift',
    isFirstEver: false,
    sharedToCircle: true,
    circleCount: 3,
    traded: false,
    sharedCount: 4,
    listenCount: 62,
    isOnRepeat: false,
    isSpecial: false,
    isPinned: false,
    isFavorite: true,
    senderPalette: palette(
      [0.2, 0.5, 0.8], [0.1, 0.25, 0.4], [0.9, 0.7, 0.2], [0.15, 0.35, 0.6], 0.5,
    ),
    genre: 'R&B',
    year: 2016,
    duration: 183,
    mood: 'Dreamy',
    tags: ['r&b', 'frank-ocean', 'blonde', 'summer'],
    memory: 'Alex sent me this after we talked about growing up. The strings at the end always get me.',
  },

  // Card 4: Shared to circle, Chroma frame
  {
    id: 'card-004',
    title: 'Motion Sickness',
    artist: 'Phoebe Bridgers',
    album: 'Stranger in the Alps',
    coverArtUrl: 'https://i.scdn.co/image/ab67616d0000b273a91e3cca4e3e2846e792e6a0',
    palette: palette(
      [0.3, 0.35, 0.55], [0.15, 0.18, 0.3], [0.8, 0.75, 0.6], [0.25, 0.28, 0.4], 0.35,
    ),
    waveformData: generateWaveform(9),
    bpm: 130,
    createdAt: '2025-08-10T00:00:00Z',
    daysInCollection: 217,
    addedVia: 'radio',
    isFirstEver: false,
    sharedToCircle: true,
    circleCount: 2,
    traded: false,
    sharedCount: 6,
    listenCount: 89,
    isOnRepeat: true,
    isSpecial: false,
    isPinned: false,
    isFavorite: false,
    genre: 'Indie',
    year: 2017,
    duration: 263,
    mood: 'Bittersweet',
    tags: ['indie', 'phoebe-bridgers', 'sad', 'guitar'],
    notes: 'Found this on Radio at 2am. Instant keeper.',
  },

  // Card 5: On repeat with lots of badges
  {
    id: 'card-005',
    title: 'Ivy',
    artist: 'Taylor Swift',
    album: 'evermore',
    coverArtUrl: 'https://i.scdn.co/image/ab67616d0000b273f8553e18a11a7f6b1e54c114',
    previewUrl: 'https://p.scdn.co/mp3-preview/example5',
    palette: palette(
      [0.4, 0.55, 0.35], [0.2, 0.3, 0.15], [0.85, 0.75, 0.5], [0.35, 0.45, 0.3], 0.6,
    ),
    waveformData: generateWaveform(3),
    bpm: 112,
    createdAt: '2024-12-01T00:00:00Z',
    daysInCollection: 470,
    addedVia: 'search',
    isFirstEver: false,
    sharedToCircle: true,
    circleCount: 4,
    traded: true,
    sharedCount: 9,
    listenCount: 156,
    isOnRepeat: true,
    isSpecial: false,
    isPinned: true,
    isFavorite: true,
    genre: 'Indie Folk',
    year: 2020,
    duration: 217,
    mood: 'Yearning',
    tags: ['indie-folk', 'taylor-swift', 'evermore', 'cottagecore'],
    memory: 'This was the soundtrack to that winter where everything changed. The bridge still gives me chills every single time.',
    rating: 5,
  },
];
