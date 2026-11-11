/**
 * Icon keys the ImagePicker uses. Existing keys: delete, close, file, torch, cameraOff, copy, error, add. NEW keys the icon registry (ui/icons.ts)
 * must gain (Phosphor, one /dist/csr/<Name> import each): camera -> Camera, clipboard -> ClipboardText, link -> LinkSimple,
 * rotateLeft -> ArrowCounterClockwise (already imported as `undo`/`unarchive`: alias only, no new glyph), rotateRight -> ArrowClockwise,
 * No `image` glyph: the empty and broken preview use the existing `file`. See docs/dev/design/ip1-imagepicker.md "Icons".
 */
export const IMAGE_PICKER_ICONS = ['camera', 'clipboard', 'link', 'rotateLeft', 'rotateRight', 'delete', 'close', 'file', 'torch', 'error'] as const
export type ImagePickerIcon = (typeof IMAGE_PICKER_ICONS)[number]
