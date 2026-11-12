// Which sources the Photo tab offers on this device (photo-read.md section 4.4). STUB.
export interface PhotoSourceOptions {
  /** A phone or tablet: Take photo opens the system camera (never a live view). */
  showTakePhoto: boolean
  /** The accept string of the library / files input. */
  libraryAccept: string
  multiple: true
  /** Computer: the "or paste or drop" hint (paste is still handled on a phone). */
  pasteAndDrop: boolean
}

export function usePhotoSources(): PhotoSourceOptions {
  throw new Error('usePhotoSources: not implemented')
}
