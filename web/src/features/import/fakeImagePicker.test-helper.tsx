// A stand-in for ui/ImagePicker in the Read-a-recipe tests (the real one needs a camera, a canvas and an image engine).
// Use: vi.mock('../../../ui/ImagePicker', async () => (await import('../fakeImagePicker.test-helper')).fakeImagePickerModule())
// It records every render's props and shows two buttons per picker: "Choose <label>" (reports PICKED) and "Remove <label>".
import { createElement } from 'react'
import type { RawImage } from '../../ui/ImagePicker'

export const pickerRenders: Array<Record<string, unknown>> = []
export const PICKED: RawImage = {
  kind: 'blob',
  blob: new Blob([new Uint8Array(8)], { type: 'image/jpeg' }),
  dataUrl: 'data:image/jpeg;base64,AAAA',
  width: 2576,
  height: 1932,
  type: 'image/jpeg',
  origin: 'file',
}
export const PICKED_2: RawImage = { ...PICKED, dataUrl: 'data:image/jpeg;base64,BBBB' }

export function lastPickerProps(label: string): Record<string, unknown> | undefined {
  return [...pickerRenders].reverse().find((p) => p.label === label)
}

export function fakeImagePickerModule() {
  return {
    CROP_ASPECTS: { landscape: 4 / 3, square: 1 },
    ImagePicker: (p: { label: string; value: unknown; onChange: (v: RawImage | null) => void; disabled?: boolean }) => {
      pickerRenders.push(p as unknown as Record<string, unknown>)
      return createElement(
        'div',
        { role: 'group', 'aria-label': p.label, 'data-disabled': p.disabled || undefined },
        createElement('button', { type: 'button', disabled: p.disabled, onClick: () => p.onChange(p.label === 'Photo 2' ? PICKED_2 : PICKED) }, `Choose ${p.label}`),
        p.value ? createElement('button', { type: 'button', disabled: p.disabled, onClick: () => p.onChange(null) }, `Remove ${p.label}`) : null,
      )
    },
  }
}
