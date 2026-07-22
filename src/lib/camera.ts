// Module-level singleton for camera management
// This ensures we only call getUserMedia ONCE and reuse the same stream

type CameraState = {
  stream: MediaStream | null;
  deviceId: string | null;
  initPromise: Promise<{ stream: MediaStream; deviceId: string }> | null;
  initialized: boolean;
};

const state: CameraState = {
  stream: null,
  deviceId: null,
  initPromise: null,
  initialized: false,
};

/**
 * Initialize the camera with the given facingMode.
 * Subsequent calls return the existing stream without calling getUserMedia again.
 */
export async function initCamera(
  facingMode: 'user' | 'environment' = 'environment'
): Promise<{ stream: MediaStream; deviceId: string }> {
  // If we already have a stream, return it immediately
  if (state.stream && state.deviceId) {
    return { stream: state.stream, deviceId: state.deviceId };
  }

  // If initialization is already in progress, wait for it
  if (state.initPromise) {
    return state.initPromise;
  }

  // Start initialization
  state.initPromise = (async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280, min: 320 },
          height: { ideal: 720, min: 240 },
        },
      });

      state.stream = mediaStream;
      state.initialized = true;

      // Extract device ID from the video track
      const track = mediaStream.getVideoTracks()[0];
      const settings = track.getSettings();
      state.deviceId = settings.deviceId || `camera-${facingMode}`;

      return { stream: state.stream, deviceId: state.deviceId };
    } catch (err) {
      // Clear initPromise so future calls can retry
      state.initPromise = null;
      throw err;
    }
  })();

  return state.initPromise;
}

/**
 * Get the current camera state without initializing
 */
export function getCameraState(): { stream: MediaStream | null; deviceId: string | null } {
  return { stream: state.stream, deviceId: state.deviceId };
}

/**
 * Check if camera is initialized
 */
export function isCameraInitialized(): boolean {
  return state.initialized && state.stream !== null && state.stream.active;
}

/**
 * Release the camera stream. Call this on app unmount.
 */
export function releaseCamera(): void {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }
  state.stream = null;
  state.deviceId = null;
  state.initPromise = null;
  state.initialized = false;
}
