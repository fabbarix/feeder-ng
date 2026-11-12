export interface CameraEnv {
  hasGetUserMedia: boolean
  /** matchMedia('(pointer: coarse)'): a phone or tablet. */
  coarsePointer: boolean
  /** iOS home-screen web app, where getUserMedia is unreliable. */
  iosStandalone: boolean
}

/**
 * 'viewfinder' = our getUserMedia viewfinder; 'capture-input' = the system camera through a hidden `<input capture>`;
 * 'none' = no camera offered. Rules: no getUserMedia -> capture-input when coarsePointer, else none; iosStandalone -> capture-input;
 * otherwise viewfinder. After a camera failure (denied, in use, error) the UI falls back to capture-input whatever this says.
 */
export type CameraPolicy = 'live' | 'system'

export function cameraStrategy(env: CameraEnv, policy: CameraPolicy = 'live'): 'viewfinder' | 'capture-input' | 'none' {
  // 'system' (the photo read): never the live view; a phone or tablet uses the system camera, a computer uses files, paste and drop.
  if (policy === 'system') return env.coarsePointer ? 'capture-input' : 'none'
  if (env.iosStandalone) return 'capture-input'
  if (!env.hasGetUserMedia) return env.coarsePointer ? 'capture-input' : 'none'
  return 'viewfinder'
}
