/** Limits shared by the picker and its libs. The server enforces the same ones (internal/imaging: MaxBytes 8 MB, MaxSide 1600, 12000 px / 50 MP). */
export const MAX_UPLOAD_BYTES = 8 << 20
/**
 * TODO(heic): HEIC/HEIF are refused until the server-side decoder lands (internal/imaging/heic.go). Flip to true then, and flip the
 * tests marked TODO(heic) back (problems, ImagePicker.file/empty, useImageIngest).
 */
export const HEIC_ENABLED = false
/** The formats the server decodes. GIF, AVIF, PDF and the like (HEIC/HEIF too, while HEIC_ENABLED is false) are refused with a message. */
export const ACCEPT_TYPES = (HEIC_ENABLED
  ? ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  : ['image/jpeg', 'image/png', 'image/webp']) as readonly string[]
/**
 * The `accept` string of the file input. With HEIC on, the extensions are there because Chrome and Windows often report no type for HEIC files.
 */
export const ACCEPT = (HEIC_ENABLED ? [...ACCEPT_TYPES, '.heic', '.heif'] : [...ACCEPT_TYPES]).join(',')
/** Upload mode pre-shrinks to this long edge before sending (a 200 MP phone photo would exceed the server's 50 MP cap); the server then scales to 1600. */
export const UPLOAD_MAX_SIDE = 3200
/** Raw mode (Recipe Assistant "Read from a photo") default long edge. */
export const RAW_MAX_SIDE = 2576
export const DEFAULT_QUALITY = 0.9
