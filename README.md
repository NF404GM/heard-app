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

- Single HTML file (~361 KB, ~96 KB gzipped)
- Vanilla JS — no frameworks, no build tools
- CSS custom properties for theming
- iTunes Search API for song data
- Vibrant.js for color extraction
- IndexedDB-backed persistence (with an in-memory fallback) plus service-worker caching

## Running Locally

The UI is static, but the service worker, install prompt, and most offline behavior still need a local server. From the repo root you can run `python -m http.server 4173` or `npx serve . --listen 4173`, then open `http://localhost:4173` to exercise PWA/offline flows, playlist sharing, and IndexedDB persistence on the same origin you would use in production-like testing.

If you're serving the app from another static host or a subpath, verify install/offline behavior from that final URL so the manifest scope and service-worker cache entries match the deployed origin.

## Contributor checklist

1. Confirm the visible version string in the footer, the settings modal, and any README labels all match the version you are about to ship.
2. Update the service worker cache name/comment, the manifest metadata, and the IndexedDB schema version together so upgrades hit everywhere at once.
3. Run the app from `localhost` or another HTTPS origin, then test search ➜ claim, collection persistence, exports/imports (JSON + CSV), and shared-deck URLs while online and offline.
4. Verify the export/clear/data paths still line up with the README guidance and shareable URLs; flag any offline-only assumptions before merging.

## Version

v1.8.1 — Phase 1 Web Beta

## License

All rights reserved. © 2026 Tommie Ellis / good.softworks
