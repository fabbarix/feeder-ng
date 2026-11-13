// The Picture of the new-Product sheet (SR5, 13.5 step 4): the phone's own camera shot, centre-cropped to 4:3 and downscaled by the
// shared ImagePicker pipeline, then uploaded (online) or kept as a Blob for the queue (offline). Plain TypeScript, no React.
import { blobToDataUrl, browserEngine, prepareImage, type RawImage, type Rect } from '../../../ui'
import { imageApi } from '../../../ui/ImagePicker/api'
import { OFFLINE_PICTURE_MAX_BYTES, OFFLINE_PICTURE_MAX_SIDE } from './offlinePicture'

/** The two things a Picture needs from the outside, so tests (and an offline phone) can replace them. */
export interface PictureHandlers {
  /** The captured file, centre-cropped to 4:3 and downscaled (OFFLINE_PICTURE_MAX_SIDE / _MAX_BYTES). Rejects for a file that is not a usable image. */
  prepare(file: File): Promise<RawImage>
  /** Online only: uploads a prepared Picture (POST /api/images) and resolves with the image id. */
  upload(image: RawImage): Promise<string>
}

/** The largest 4:3 area of a picture, centred. */
export function centreCrop4x3(width: number, height: number): Rect {
  const ratio = 4 / 3
  if (width / height > ratio) {
    const cropped = Math.round(height * ratio)
    return { x: Math.round((width - cropped) / 2), y: 0, width: cropped, height }
  }
  const cropped = Math.round(width / ratio)
  return { x: 0, y: Math.round((height - cropped) / 2), width, height: cropped }
}

/** The default handlers: the shared ImagePicker pipeline and POST /api/images. */
export const newProductPictures: PictureHandlers = {
  async prepare(file) {
    const decoded = await browserEngine.decode(file)
    const { width, height } = decoded
    decoded.close()
    const prepared = await prepareImage(
      file,
      { maxSide: OFFLINE_PICTURE_MAX_SIDE, maxBytes: OFFLINE_PICTURE_MAX_BYTES, crop: centreCrop4x3(width, height), forceEncode: true },
      browserEngine,
    )
    return { kind: 'blob', blob: prepared.blob, width: prepared.width, height: prepared.height, type: prepared.type, origin: 'camera' }
  },
  async upload(image) {
    if (image.kind !== 'blob') throw new Error('a picture link is not uploaded here')
    const stored = await imageApi.uploadDataUrl(await blobToDataUrl(image.blob))
    return stored.id
  },
}
