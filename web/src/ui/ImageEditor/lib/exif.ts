// Stub (test-first step): the implementation follows the tests. See docs/dev/design/photo-read.md section 3.1.
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export interface JpegInfo {
  orientation: Orientation
  width?: number
  height?: number
}

export function readJpegInfo(_bytes: Uint8Array): JpegInfo {
  throw new Error('not implemented')
}
export function orientationOps(_o: Orientation): { turns: 0 | 1 | 2 | 3; mirror: boolean } {
  throw new Error('not implemented')
}
export function orientedSize(_width: number, _height: number, _o: Orientation): { width: number; height: number } {
  throw new Error('not implemented')
}
export function needsManualOrientation(_browserApplies: boolean, _o: Orientation): boolean {
  throw new Error('not implemented')
}
