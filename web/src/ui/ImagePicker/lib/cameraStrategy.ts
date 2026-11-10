export interface CameraEnv {
  hasGetUserMedia: boolean
  /** matchMedia('(pointer: coarse)'): a phone or tablet. */
  coarsePointer: boolean
  /** iOS home-screen web app, where getUserMedia is unreliable. */
  iosStandalone: boolean
}

/**
 * IP1 stub. 'viewfinder' = our getUserMedia viewfinder; 'capture-input' = the system camera through a hidden `<input capture>`;
 * 'none' = no camera offered. Rules: no getUserMedia -> capture-input when coarsePointer, else none; iosStandalone -> capture-input;
 * otherwise viewfinder. After a camera failure (denied, in use, error) the UI falls back to capture-input whatever this says.
 */
export function cameraStrategy(_env: CameraEnv): 'viewfinder' | 'capture-input' | 'none' {
  return 'none'
}
