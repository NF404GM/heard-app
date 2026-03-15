/**
 * HEARD — GPU Context Provider
 * React context that wraps the entire app, providing GPU device access.
 * Handles device initialization, battery awareness, reduced motion, and fallback state.
 */
import React, { createContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { initGPU, getGPUDevice, isGPUAvailable } from './init';
import type { GPUContextState } from './types/gpu.types';

// ═══════════════════════════════════════
// Context
// ═══════════════════════════════════════

const defaultState: GPUContextState = {
  device: null,
  isAvailable: false,
  isReducedMotion: false,
  isBatteryLow: false,
};

export const GPUContext = createContext<GPUContextState>(defaultState);

// ═══════════════════════════════════════
// Provider
// ═══════════════════════════════════════

interface GPUProviderProps {
  children: React.ReactNode;
}

export function GPUProvider({ children }: GPUProviderProps) {
  const [state, setState] = useState<GPUContextState>(defaultState);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Initialize GPU device
  useEffect(() => {
    let mounted = true;

    async function init() {
      const device = await initGPU();
      if (mounted) {
        setState((prev) => ({
          ...prev,
          device,
          isAvailable: device !== null,
        }));
      }
    }

    init();
    return () => { mounted = false; };
  }, []);

  // Monitor reduced motion preference
  useEffect(() => {
    // React Native doesn't have matchMedia, but we can check AccessibilityInfo
    // For now, default to false and integrate with AccessibilityInfo later
    const checkReducedMotion = async () => {
      try {
        const { AccessibilityInfo } = require('react-native');
        const isReducedMotion = await AccessibilityInfo.isReduceMotionEnabled();
        setState((prev) => ({ ...prev, isReducedMotion }));

        const subscription = AccessibilityInfo.addEventListener(
          'reduceMotionChanged',
          (enabled: boolean) => {
            setState((prev) => ({ ...prev, isReducedMotion: enabled }));
          }
        );

        return () => subscription?.remove?.();
      } catch {
        // AccessibilityInfo not available, keep default
      }
    };

    checkReducedMotion();
  }, []);

  // Monitor battery level
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function checkBattery() {
      try {
        // Battery API (web) — may not be available in React Native
        if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
          const battery = await (navigator as any).getBattery();
          const updateBattery = () => {
            setState((prev) => ({
              ...prev,
              isBatteryLow: battery.level < 0.2 && !battery.charging,
            }));
          };
          updateBattery();
          battery.addEventListener('levelchange', updateBattery);
          battery.addEventListener('chargingchange', updateBattery);
          return () => {
            battery.removeEventListener('levelchange', updateBattery);
            battery.removeEventListener('chargingchange', updateBattery);
          };
        }
      } catch {
        // Battery API not available
      }
    }

    checkBattery();
    // Poll every 30 seconds as a fallback
    interval = setInterval(checkBattery, 30000);
    return () => clearInterval(interval);
  }, []);

  // Pause GPU work when app backgrounds
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      // GPU systems should check appStateRef to pause/resume
    });
    return () => subscription.remove();
  }, []);

  return (
    <GPUContext.Provider value={state}>
      {children}
    </GPUContext.Provider>
  );
}

// ═══════════════════════════════════════
// Hook
// ═══════════════════════════════════════

/**
 * Access the GPU context from any component.
 * Returns device, availability, and accessibility/battery state.
 */
export function useGPUContext(): GPUContextState {
  return React.use(GPUContext);
}

/**
 * Determine the effective animation tier based on GPU state.
 * Used by all visual systems to degrade gracefully.
 *
 * Returns:
 * - 'full': all effects enabled
 * - 'reduced': static effects only (reduced motion or battery low)
 * - 'fallback': CPU fallbacks only (no GPU)
 */
export function useEffectTier(): 'full' | 'reduced' | 'fallback' {
  const { isAvailable, isReducedMotion, isBatteryLow } = useGPUContext();

  if (!isAvailable) return 'fallback';
  if (isReducedMotion || isBatteryLow) return 'reduced';
  return 'full';
}
