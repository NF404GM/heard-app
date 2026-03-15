/**
 * HEARD — GPU Device Initialization
 * Initializes WebGPU device with fallback for unsupported devices.
 * Must be called once at app startup before any GPU operations.
 */

let cachedDevice: GPUDevice | null = null;
let initAttempted = false;

/**
 * Initialize the GPU device. Returns null if WebGPU is unavailable.
 * Caches the device for subsequent calls.
 */
export async function initGPU(): Promise<GPUDevice | null> {
  if (initAttempted) return cachedDevice;
  initAttempted = true;

  try {
    // Check for WebGPU API availability
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      console.warn('[HEARD GPU] WebGPU not available on this device');
      return null;
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'low-power', // Battery-friendly default
    });

    if (!adapter) {
      console.warn('[HEARD GPU] No GPU adapter found');
      return null;
    }

    // Log adapter info for debugging
    const info = (adapter as any).requestAdapterInfo ? await (adapter as any).requestAdapterInfo() : adapter.info;
    if (info) {
      console.log(`[HEARD GPU] Adapter: ${info.vendor} ${info.device}`);
    }

    const device = await adapter.requestDevice({
      requiredFeatures: [],
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxComputeWorkgroupSizeX: 256,
      },
    });

    // Handle device loss gracefully
    device.lost.then((info: { message: string }) => {
      console.error(`[HEARD GPU] Device lost: ${info.message}`);
      cachedDevice = null;
      initAttempted = false;
      // Attempt recovery after a delay
      setTimeout(() => initGPU(), 1000);
    });

    cachedDevice = device;
    console.log('[HEARD GPU] Device initialized successfully');
    return device;
  } catch (error) {
    console.warn('[HEARD GPU] Failed to initialize:', error);
    return null;
  }
}

/**
 * Get the cached GPU device (must call initGPU first)
 */
export function getGPUDevice(): GPUDevice | null {
  return cachedDevice;
}

/**
 * Check if GPU is available without initializing
 */
export function isGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Reset GPU state (for testing or error recovery)
 */
export function resetGPU(): void {
  if (cachedDevice) {
    cachedDevice.destroy();
  }
  cachedDevice = null;
  initAttempted = false;
}
