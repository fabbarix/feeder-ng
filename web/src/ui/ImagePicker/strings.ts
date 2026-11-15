import { imageEditorStrings } from '../ImageEditor/strings'
import { MAX_UPLOAD_BYTES } from './lib/limits'
import type { ImageProblemCode } from './lib/problems'


/** "The image is larger than N MB." for a byte limit. */
export const tooLargeMessage = (bytes: number): string => `The image is larger than ${Math.round((bytes / (1 << 20)) * 10) / 10} MB.`

/** "JPEG, PNG, WebP or HEIC, up to N MB." for a byte limit. */
export const limitHelperFor = (bytes: number): string => `JPEG, PNG, WebP or HEIC, up to ${Math.round((bytes / (1 << 20)) * 10) / 10} MB.`

const PASTE_HINT = 'Press Ctrl+V (Cmd+V on a Mac) while this box is focused.'

/** English copy of the ImagePicker (kept out of ui/strings.ts, which another team edits). */
export const imagePickerStrings = {
  ...imageEditorStrings,
  limitHelper: limitHelperFor(MAX_UPLOAD_BYTES),
  addImage: 'Add an image',
  replaceImage: 'Replace image',
  pasteImage: 'Paste image',
  pasteLink: 'Paste link',
  takePhoto: 'Take photo',
  useCameraApp: 'Use the camera app',
  crop: 'Crop',
  removeImage: 'Remove image',
  /** B9-30 (R-A): the full picker's button; "or drop it here" is text in the zone. */
  chooseFile: 'Choose a file',
  dropHint: 'or drop it here',
  /** B9-30: the compact picker. */
  noPictureYet: 'No Picture yet.',
  change: 'Change',
  remove: 'Remove',
  cancel: 'Cancel',
  preparing: 'Preparing the image',
  uploading: 'Saving the image',
  converting: 'Converting photo…',
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
  cropLoading: 'Loading the image',
  useCrop: 'Use crop',
  problems: {
    unsupported: 'That is not a JPEG, PNG, WebP or HEIC image.',
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

/**
 * B9-37: the add / replace / remove words. A host that names its picture passes the GLOSSARY noun ("Photo" for a Recipe, a Step or a
 * Member; "Picture" for an Ingredient or a Product); without one the picker says "image" as before.
 */
export const pictureActionLabels = (noun?: string): { add: string; replace: string; remove: string } =>
  noun ? { add: `Add ${noun}`, replace: `Replace ${noun}`, remove: `Remove ${noun}` } : { add: imagePickerStrings.addImage, replace: imagePickerStrings.replaceImage, remove: imagePickerStrings.removeImage }

/**
 * B9-37 (A11Y-08, P38): the compact picker's button names when the picker repeats down a list ("Step 2"): "Choose a file for Step 2",
 * "Take photo for Step 2", "Change Photo of Step 2", "Remove Photo of Step 2". The visible words stay Choose a file, Take photo, Change, Remove.
 */
export const compactActionNames = (context: string, noun = 'image'): { choose: string; take: string; change: string; remove: string } => ({
  choose: `${imagePickerStrings.chooseFile} for ${context}`,
  take: `${imagePickerStrings.takePhoto} for ${context}`,
  change: `Change ${noun} of ${context}`,
  remove: `Remove ${noun} of ${context}`,
})
