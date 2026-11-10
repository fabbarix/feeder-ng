/** Limits shared by the picker and its libs. The server enforces the same ones (internal/imaging: MaxBytes 8 MB, MaxSide 1600, 12000 px / 50 MP). */
export const MAX_UPLOAD_BYTES = 8 << 20
/** The formats the server decodes. HEIC/HEIF and GIF are refused with a message. */
export const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const ACCEPT = ACCEPT_TYPES.join(',')
/** Upload mode pre-shrinks to this long edge before sending (a 200 MP phone photo would exceed the server's 50 MP cap); the server then scales to 1600. */
export const UPLOAD_MAX_SIDE = 3200
/** Raw mode (Recipe Assistant "Read from a photo") default long edge. */
export const RAW_MAX_SIDE = 2576
export const DEFAULT_QUALITY = 0.9
