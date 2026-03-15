/**
 * HEARD — Badge Material Shaders
 * 7 distinct badge materials as WGSL shader functions.
 * Each takes a badge UV, base color, and time — returns modified color.
 *
 * Materials:
 *   0 MATTE:           flat color, no animation
 *   1 EMBOSS:          lighter top edge, darker bottom edge
 *   2 FOIL_STAMP:      gold foil shimmer sweep
 *   3 GLOW:            soft bloom around badge
 *   4 ANIMATED_ROTATE: very slow continuous rotation
 *   5 SCAN_LINE:       horizontal scan line animation
 *   6 PATINA:          grain/noise texture overlay — aged quality
 */
import {
  BADGE_IDS,
  BADGE_MATERIALS,
  BADGE_MATERIAL_MAP,
  type BadgeId,
  type BadgeMaterial,
} from '../../types/gpu.types';

// ═══════════════════════════════════════
// WGSL Material Functions
// ═══════════════════════════════════════

export const MATTE_MATERIAL_WGSL = /* wgsl */ `
  // Material 0: MATTE — flat color pass-through
  fn matteShade(uv: vec2f, baseColor: vec4f, time: f32) -> vec4f {
    return baseColor;
  }
`;

export const EMBOSS_MATERIAL_WGSL = /* wgsl */ `
  // Material 1: EMBOSS — lighter top edge, darker bottom edge
  fn embossShade(uv: vec2f, baseColor: vec4f, time: f32) -> vec4f {
    // Gradient from top (lighter) to bottom (darker)
    let topBias = 1.0 - uv.y; // 1 at top, 0 at bottom
    let lightShift = (topBias - 0.5) * 0.3; // ±0.15 brightness shift
    let embossed = clamp(baseColor.rgb + vec3f(lightShift), vec3f(0.0), vec3f(1.0));
    return vec4f(embossed, baseColor.a);
  }
`;

export const FOIL_STAMP_MATERIAL_WGSL = /* wgsl */ `
  // Material 2: FOIL_STAMP — gold shimmer sweep across badge
  fn foilStampShade(uv: vec2f, baseColor: vec4f, time: f32) -> vec4f {
    // Diagonal sweep across badge every 4 seconds
    let sweepPhase = fract(time / 4.0);
    let sweepPos = sweepPhase * 2.0 - 0.5; // sweep from -0.5 to 1.5
    let diag = (uv.x + uv.y) * 0.5; // diagonal position 0→1
    let dist = abs(diag - sweepPos);
    let shimmer = smoothstep(0.15, 0.0, dist);

    // Gold-ish highlight derived from base color (warm shift)
    let goldTint = vec3f(
      min(baseColor.r + 0.2, 1.0),
      min(baseColor.g + 0.15, 1.0),
      baseColor.b * 0.8
    );
    let result = mix(baseColor.rgb, goldTint, shimmer * 0.7);
    // Add specular highlight
    let specular = shimmer * 0.4;
    return vec4f(result + vec3f(specular), baseColor.a);
  }
`;

export const GLOW_MATERIAL_WGSL = /* wgsl */ `
  // Material 3: GLOW — soft bloom extending beyond badge shape
  fn glowShade(uv: vec2f, baseColor: vec4f, time: f32) -> vec4f {
    // Distance from badge center
    let centerDist = length(uv - vec2f(0.5));

    // Inner badge stays solid
    if (centerDist < 0.35) {
      return baseColor;
    }

    // Soft bloom falloff outside badge center
    let bloomFalloff = smoothstep(0.6, 0.35, centerDist);
    let pulse = sin(time * 1.5) * 0.1 + 0.9; // gentle pulse
    let bloomAlpha = bloomFalloff * baseColor.a * 0.5 * pulse;

    return vec4f(baseColor.rgb, bloomAlpha);
  }
`;

export const ANIMATED_ROTATE_MATERIAL_WGSL = /* wgsl */ `
  // Material 4: ANIMATED_ROTATE — very slow continuous rotation
  fn animatedRotateShade(uv: vec2f, baseColor: vec4f, time: f32) -> vec4f {
    // Rotate UV around center — one full rotation every 20 seconds
    let angle = time * 0.3141592653; // 2*PI / 20
    let center = vec2f(0.5);
    let offset = uv - center;
    let cosA = cos(angle);
    let sinA = sin(angle);
    let rotated = vec2f(
      offset.x * cosA - offset.y * sinA,
      offset.x * sinA + offset.y * cosA
    ) + center;

    // Subtle directional gradient based on rotated position
    let gradient = (rotated.x + rotated.y) * 0.5;
    let shift = gradient * 0.1 - 0.05; // ±0.05 brightness
    let result = clamp(baseColor.rgb + vec3f(shift), vec3f(0.0), vec3f(1.0));

    return vec4f(result, baseColor.a);
  }
`;

export const SCAN_LINE_MATERIAL_WGSL = /* wgsl */ `
  // Material 5: SCAN_LINE — horizontal scan line animation
  fn scanLineShade(uv: vec2f, baseColor: vec4f, time: f32) -> vec4f {
    // Scan line moves top to bottom every 2 seconds
    let scanPhase = fract(time * 0.5);
    let scanY = scanPhase;
    let dist = abs(uv.y - scanY);
    let scanIntensity = smoothstep(0.08, 0.0, dist);

    // Brighten along scan line
    let scanned = baseColor.rgb + vec3f(scanIntensity * 0.3);

    // Faint horizontal line pattern (CRT effect)
    let linePattern = step(0.5, fract(uv.y * 20.0));
    let lineDarken = mix(1.0, 0.95, linePattern);

    return vec4f(scanned * lineDarken, baseColor.a);
  }
`;

export const PATINA_MATERIAL_WGSL = /* wgsl */ `
  // Material 6: PATINA — grain/noise overlay for aged quality
  // Simple hash-based noise (deterministic per pixel)
  fn hash21(p: vec2f) -> f32 {
    var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  fn patinaShade(uv: vec2f, baseColor: vec4f, time: f32) -> vec4f {
    // Static grain noise
    let noise = hash21(uv * 100.0) * 0.15 - 0.075; // ±0.075

    // Slight green-brown aged tint shift
    let agedShift = vec3f(-0.02, 0.01, -0.03);

    // Darken edges slightly (vignette)
    let edgeDist = length(uv - vec2f(0.5)) * 1.4;
    let vignette = 1.0 - edgeDist * edgeDist * 0.2;

    let result = (baseColor.rgb + agedShift + vec3f(noise)) * vignette;
    return vec4f(clamp(result, vec3f(0.0), vec3f(1.0)), baseColor.a);
  }
`;

// ═══════════════════════════════════════
// Combined WGSL — all materials in one block for the compositor
// ═══════════════════════════════════════

export const ALL_BADGE_MATERIALS_WGSL = /* wgsl */ `
  ${MATTE_MATERIAL_WGSL}
  ${EMBOSS_MATERIAL_WGSL}
  ${FOIL_STAMP_MATERIAL_WGSL}
  ${GLOW_MATERIAL_WGSL}
  ${ANIMATED_ROTATE_MATERIAL_WGSL}
  ${SCAN_LINE_MATERIAL_WGSL}
  ${PATINA_MATERIAL_WGSL}

  // Dispatch to correct material by ID
  fn applyBadgeMaterial(materialId: u32, uv: vec2f, baseColor: vec4f, time: f32) -> vec4f {
    switch (materialId) {
      case 0u: { return matteShade(uv, baseColor, time); }
      case 1u: { return embossShade(uv, baseColor, time); }
      case 2u: { return foilStampShade(uv, baseColor, time); }
      case 3u: { return glowShade(uv, baseColor, time); }
      case 4u: { return animatedRotateShade(uv, baseColor, time); }
      case 5u: { return scanLineShade(uv, baseColor, time); }
      case 6u: { return patinaShade(uv, baseColor, time); }
      default: { return matteShade(uv, baseColor, time); }
    }
  }
`;

// ═══════════════════════════════════════
// TypeScript Lookup
// ═══════════════════════════════════════

/**
 * Get the material type for a given badge ID.
 * Uses the canonical BADGE_MATERIAL_MAP from gpu.types.ts.
 */
export function getBadgeMaterial(badgeId: BadgeId): BadgeMaterial {
  return BADGE_MATERIAL_MAP[badgeId] ?? BADGE_MATERIALS.MATTE;
}
