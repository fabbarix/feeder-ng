// A stand-in for <ImagePicker> in HOST tests (a feature wires the picker; it does not re-test it). The real picker has its own suites.
// Use it with:  vi.mock('../../../ui', async (orig) => ({ ...(await orig<object>()), ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker }))
// Hosts must therefore import ImagePicker and CROP_ASPECTS from the ui barrel ('../../../ui').
import type { ImagePickerProps } from './types'

export const PICKED_ID = 'f'.repeat(32)

/** A group named by `label`. Exposes the props a host sets (data-value, data-aspect, data-size, data-mode) and four buttons: pick -> onChange(PICKED_ID), remove -> onChange(''), start upload -> onBusyChange(true), finish upload -> onBusyChange(false). */
export function FakeImagePicker(props: ImagePickerProps) {
  const onChange = props.onChange as (v: string) => void
  return (
    <div
      role="group"
      aria-label={props.label}
      data-testid="fake-image-picker"
      data-value={typeof props.value === 'string' ? props.value : ''}
      data-aspect={String((props as { aspect?: unknown }).aspect ?? '')}
      data-size={String((props as { size?: unknown }).size ?? '')}
      data-mode={(props as { mode?: string }).mode ?? 'upload'}
    >
      <button type="button" onClick={() => onChange(PICKED_ID)}>
        {`pick ${props.label}`}
      </button>
      <button type="button" onClick={() => onChange('')}>
        {`remove ${props.label}`}
      </button>
      {/* PE: lets a host test drive onBusyChange: "start upload" -> true, "finish upload" -> false. */}
      <button type="button" onClick={() => props.onBusyChange?.(true)}>
        {`start upload ${props.label}`}
      </button>
      <button type="button" onClick={() => props.onBusyChange?.(false)}>
        {`finish upload ${props.label}`}
      </button>
    </div>
  )
}
