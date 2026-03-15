// HEARD Design Tokens — source of truth
export const tokens = {
  colors: {
    bg: '#0E0E10',
    surface: '#1A1A1E',
    surfaceLight: '#252528',
    text: '#F0EEE9',
    textMuted: '#8A8A8E',
    action: '#E8E0D0',
    gold: '#C9A84C',
    goldLight: '#D4B96A',
    accent: '#6C63FF',
    error: '#FF4C4C',
    success: '#4CAF50',
  },
  fonts: {
    display: 'SpaceGrotesk',      // titles, card names
    body: 'Inter',                 // body text
    editorial: 'SourceSerif4',     // stories, memories
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    card: 16,
    button: 12,
    badge: 8,
    pill: 20,
  },
  card: {
    width: 320,
    height: 426,  // ~3:4 ratio
    artSize: 280,
  },
} as const;
