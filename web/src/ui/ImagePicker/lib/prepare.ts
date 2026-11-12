import { makeCanvas } from '../../ImageEditor/lib/prepare'

export {
  addTurn,
  browserEngine,
  fitWithin,
  makeCanvas,
  prepareImage,
  turnedSize,
  type DecodedImage,
  type ImageEngine,
  type PrepareOptions,
  type Prepared,
  type Turns,
} from '../../ImageEditor/lib/prepare'
export type { ImageProblemCode } from './problems'

/** Draws the video's current frame at its native size and returns a JPEG. */
export async function grabVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  const { ctx, toBlob } = makeCanvas(video.videoWidth || 640, video.videoHeight || 480)
  ctx.drawImage(video, 0, 0)
  return toBlob('image/jpeg', 0.92)
}
