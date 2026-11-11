// A stand-in for <ImagePicker> in tests that need RAW mode (the offline Picture of the what-is-this sheet). Use it with:
//   vi.mock('../../../ui', async (orig) => ({ ...(await orig<object>()), ImagePicker: (await import('./rawPicker.test-helper')).RawPickerFake }))
// It exposes the props a host sets as data-* attributes and three buttons: pick local (raw Blob result), remove local (null), pick uploaded (an id).
import type { ImagePickerProps, RawImage } from '../../../ui'

export const LOCAL_PICTURE: RawImage = { kind: 'blob', blob: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), width: 1600, height: 1200, type: 'image/jpeg', origin: 'file' }
export const UPLOADED_ID = 'f'.repeat(32)

export function RawPickerFake(props: ImagePickerProps) {
  const p = props as ImagePickerProps & { maxSide?: number; maxBytes?: number; sources?: readonly string[]; aspect?: unknown; listenOn?: string }
  const onChange = props.onChange as (v: unknown) => void
  return (
    <div
      role="group"
      aria-label={props.label}
      data-mode={p.mode ?? 'upload'}
      data-max-side={String(p.maxSide ?? '')}
      data-max-bytes={String(p.maxBytes ?? '')}
      data-sources={(p.sources ?? []).join(',')}
      data-aspect={String(p.aspect ?? '')}
      data-listen-on={String(p.listenOn ?? '')}
      data-has-value={p.value ? 'yes' : 'no'}
    >
      <button type="button" onClick={() => onChange(LOCAL_PICTURE)}>{`pick local ${props.label}`}</button>
      <button type="button" onClick={() => onChange(null)}>{`remove local ${props.label}`}</button>
      <button type="button" onClick={() => onChange(UPLOADED_ID)}>{`pick uploaded ${props.label}`}</button>
    </div>
  )
}
