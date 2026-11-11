import { MAX_UPLOAD_BYTES } from './lib/limits'
import type { ImageProblemCode } from './lib/problems'


/** "The image is larger than N MB." for a byte limit. */
export const tooLargeMessage = (bytes: number): string => `The image is larger than ${Math.round((bytes / (1 << 20)) * 10) / 10} MB.`

/** "JPEG, PNG or WebP, up to N MB." for a byte limit. */
export const limitHelperFor = (bytes: number): string => `JPEG, PNG or WebP, up to ${Math.round((bytes / (1 << 20)) * 10) / 10} MB.`

const PASTE_HINT = 'Press Ctrl+V (Cmd+V on a Mac) while this box is focused.'

/** English copy of the ImagePicker (kept out of ui/strings.ts, which another team edits). */
export const imagePickerStrings = {
  limitHelper: limitHelperFor(MAX_UPLOAD_BYTES),
  addImage: 'Add an image',
  replaceImage: 'Replace image',
  pasteImage: 'Paste image',
  pasteLink: 'Paste link',
  takePhoto: 'Take photo',
  useCameraApp: 'Use the camera app',
  rotateLeft: 'Rotate left',
  rotateRight: 'Rotate right',
  crop: 'Crop',
  removeImage: 'Remove image',
  cancel: 'Cancel',
  preparing: 'Preparing the image',
  uploading: 'Uploading the image',
  downloading: 'Downloading the image',
  pasteHint: PASTE_HINT,
  linkLabel: 'Image link',
  linkHelper: 'Feeder downloads the picture from this link.',
  useLink: 'Use link',
  cameraRegion: 'Camera',
  cameraStarting: 'Starting the camera',
  capture: 'Capture',
  closeCamera: 'Close camera',
  switchCamera: 'Switch camera',
  previewBroken: 'The image could not be shown.',
  cropGroup: 'Crop image',
  cropLoading: 'Loading the image',
  cropMove: 'Move crop area',
  cropReset: 'Reset',
  useCrop: 'Use crop',
  cropArea: (width: number, height: number) => `Crop area: ${width} by ${height} pixels`,
  problems: {
    unsupported: 'That is not a JPEG, PNG or WebP image. For an iPhone photo (HEIC), save or share it as JPEG or PNG.',
    too_large: tooLargeMessage(MAX_UPLOAD_BYTES),
    too_many_pixels: 'The image has too many pixels. Use one of at most 12000 pixels on its longest side.',
    empty: 'That file is empty.',
    unreadable: 'This browser cannot read that image. Try a JPEG or PNG.',
    crop_unavailable: 'The image could not be opened for cropping. Try again.',
    link_empty: 'Paste the link of a picture.',
    link_invalid: 'The link must start with https://',
    link_blocked: 'Feeder cannot download from a private address.',
    link_unreachable: 'The image could not be downloaded from that link.',
    clipboard_empty: 'There is no picture on the clipboard.',
    clipboard_denied: `The browser did not let Feeder read the clipboard. ${PASTE_HINT}`,
    clipboard_unsupported: `This browser cannot read the clipboard from a button. ${PASTE_HINT}`,
    camera_failed: 'The camera cannot be used here.',
    offline: 'The network is unreachable. Try again when you are back online.',
    failed: 'The image could not be added. Try again.',
  } satisfies Record<ImageProblemCode, string>,
}
