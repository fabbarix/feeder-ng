import { MAX_UPLOAD_BYTES } from './lib/limits'
import type { ImageProblemCode } from './lib/problems'

const MB = MAX_UPLOAD_BYTES / (1 << 20)

/** English copy of the ImagePicker (kept out of ui/strings.ts, which another team edits). IP1 stub: the Developer fills in the real copy per docs/dev/design/ip1-imagepicker.md. */
export const imagePickerStrings = {
  limitHelper: `JPEG, PNG or WebP, up to ${MB} MB.`,
  addImage: 'Add an image',
  replaceImage: 'Replace image',
  pasteImage: 'Paste image',
  pasteLink: 'Paste link',
  takePhoto: 'Take photo',
  useCameraApp: 'Use the camera app',
  rotateLeft: 'Rotate left',
  rotateRight: 'Rotate right',
  removeImage: 'Remove image',
  cancel: 'Cancel',
  preparing: 'Preparing the image',
  uploading: 'Uploading the image',
  downloading: 'Downloading the image',
  pasteHint: 'Press Ctrl+V (Cmd+V on a Mac) while this box is focused.',
  linkLabel: 'Image link',
  linkHelper: 'Feeder downloads the picture from this link.',
  useLink: 'Use link',
  cameraRegion: 'Camera',
  cameraStarting: 'Starting the camera',
  capture: 'Capture',
  closeCamera: 'Close camera',
  switchCamera: 'Switch camera',
  previewBroken: 'The image could not be shown.',
  problems: {} as Record<ImageProblemCode, string>,
}
