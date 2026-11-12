// Which sources the Photo tab offers on this device (photo-read.md section 4.4; decision 1: no live viewfinder).
import { useMemo } from 'react'
import { ACCEPT, cameraEnvironment, cameraStrategy } from '../../../ui'

export interface PhotoSourceOptions {
  /** A phone or tablet: Take photo opens the system camera (never a live view). */
  showTakePhoto: boolean
  /** The accept string of the library / files input. */
  libraryAccept: string
  multiple: true
  /** Computer: the "or paste or drop" hint (paste is still handled on a phone). */
  pasteAndDrop: boolean
}

/** Read once per mount: the device does not change while the Photo tab is open. */
export function usePhotoSources(): PhotoSourceOptions {
  return useMemo(() => {
    const env = cameraEnvironment(typeof navigator === 'undefined' ? null : (navigator.mediaDevices ?? null))
    const coarse = env.coarsePointer
    return {
      showTakePhoto: cameraStrategy(env, 'system') === 'capture-input',
      libraryAccept: coarse ? 'image/*' : ACCEPT,
      multiple: true,
      pasteAndDrop: !coarse,
    }
  }, [])
}
