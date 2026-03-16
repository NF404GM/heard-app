# heard.

**you heard it. now keep it.**

A dark-mode-only, single-file music collection app. Search for songs, collect them as beautiful cards, organize into decks, and share with friends.

## Features

- **Search & Collect** — Find songs via iTunes and add them to your collection as collectible cards
- **Card Detail** — Full-bleed album art with color-extracted palettes via Vibrant.js
- **Decks** — Organize songs into manual or smart (auto-filtered) decks
- **Shareable Decks** — Share decks via URL-hash encoded links
- **Offline Support** — Service worker with network-first navigation + cache-first static assets
- **PWA Ready** — Installable with manifest.json and service worker

## Design System

- **Aesthetic:** Editorial Dark
- **Background:** `#0E0E10`
- **Surface:** `#1A1A1E`
- **Accent:** `#E8E0D0`
- **Gold:** `#C9A84C`
- **Typography:** Space Grotesk (display), Inter (body), Source Serif 4 (editorial)
- **Card Ratio:** 2.5:3.5 with 16px radius and full-bleed cover art

## Tech Stack

- Single HTML file (~194 KB, ~58 KB gzipped)
- Vanilla JS — no frameworks, no build tools
- CSS custom properties for theming
- iTunes Search API for song data
- Vibrant.js for color extraction
- Local storage for persistence

## Running Locally

Just open `index.html` in any browser. No server required.

## Version

v1.8.1 — Phase 1 Web Beta

## License

All rights reserved. © 2026 Tommie Ellis / good.softworks
