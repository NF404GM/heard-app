# HEARD TypeGPU Implementation Spec

## Design Constraints
- Every color in every shader MUST derive from CardPalette — NO hardcoded colors except #0E0E10 (background) and #F0EEE9 (text)
- GPU effects must be invisible infrastructure — users feel it, never see it
- No effect should distract from album art or song title
- Battery < 20%: drop all animated effects to Tier 0 (Common frame, static waveform, no particles)
- Accessibility: all GPU effects must respect reduceMotion — if enabled, static versions only
- Every system needs a CPU fallback

## File paths are relative to /home/user/workspace/heard-v2/src/gpu/
## Types are in /home/user/workspace/heard-v2/src/gpu/types/gpu.types.ts
## All files use TypeScript strict mode
