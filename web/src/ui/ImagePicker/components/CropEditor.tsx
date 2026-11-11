import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Button } from '../../Button'
import { IconButton } from '../../IconButton'
import { useCropper } from '../hooks/useCropper'
import { handleLabel, type CropAspect, type Handle, type Rect } from '../lib/crop'
import { imagePickerStrings as t } from '../strings'
import './CropEditor.css'

export interface CropEditorProps {
  /** Object URL (or URL) of the picture to crop. */
  src: string
  /** Original pixel size. */
  width: number
  height: number
  aspect: CropAspect
  busy?: boolean
  /** Focus the crop box when the editor opens (the picker does; the bare editor does not). */
  autoFocus?: boolean
  /** Use crop: the turns and crop to apply. Not called when nothing changed (then onCancel). */
  onApply: (result: { turns: 0 | 1 | 2 | 3; crop: Rect }) => void
  onCancel: () => void
}

/** The width in CSS px the stage is shown at; 0 until measured. */
function useViewWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

/**
 * The crop editor panel, built on our primitives (no native UI): role=group "Crop image" with the picture, a crop box ("Move crop area")
 * with resize handles (buttons named by lib/crop handleLabel, >= 44 px, touch-action none, pointer events), a status read-out
 * ("Crop area: W by H pixels", role=status), Rotate left / Rotate right / Reset / Cancel / Use crop. Escape cancels.
 */
export function CropEditor({ src, width, height, aspect, busy, autoFocus, onApply, onCancel }: CropEditorProps) {
  const statusId = useId()
  const { ref: stageRef, width: viewWidth } = useViewWidth()
  const cropper = useCropper({ width, height, aspect, viewWidth })
  const boxRef = useRef<HTMLButtonElement>(null)
  const { bounds, rect, percent, turns } = cropper

  useEffect(() => {
    if (autoFocus) boxRef.current?.focus()
  }, [autoFocus])

  const onKeyDown = (kind: 'move' | Handle) => (e: KeyboardEvent<HTMLElement>) => {
    cropper.key(kind, e)
  }

  /** Pointer events for the box ('move') and for each handle. The element captures the pointer so a drag outside it still counts. */
  const pointer = (kind: 'move' | Handle) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (busy || (e.button !== undefined && e.button > 0)) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      cropper.begin(kind, e)
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => cropper.drag(e),
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      cropper.end(e)
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => cropper.end(e),
    onKeyDown: onKeyDown(kind),
  })

  const apply = () => {
    if (!cropper.changed) onCancel()
    else onApply({ turns: cropper.turns, crop: cropper.rect })
  }

  // The picture is shown turned: the stage has the TURNED shape, and the image (laid out in its own shape) is rotated inside it.
  const odd = turns % 2 === 1
  const imageStyle = {
    inlineSize: odd ? `${(100 * bounds.height) / bounds.width}%` : '100%',
    blockSize: odd ? `${(100 * bounds.width) / bounds.height}%` : '100%',
    transform: `translate(-50%, -50%) rotate(${turns * 90}deg)`,
  }

  const rectStyle = { insetInlineStart: `${percent.left}%`, insetBlockStart: `${percent.top}%`, inlineSize: `${percent.width}%`, blockSize: `${percent.height}%` }

  return (
    <div
      role="group"
      aria-label={t.cropGroup}
      aria-busy={busy || undefined}
      className="crop-editor"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        if (!busy) onCancel()
      }}
    >
      <div className="crop-editor__stage" data-dragging={cropper.dragging || undefined}>
        <div ref={stageRef} className="crop-editor__frame" style={{ ['--crop-ratio' as string]: String(bounds.width / bounds.height) }}>
          <div className="crop-editor__canvas">
            <img src={src} alt="" draggable={false} className="crop-editor__image" style={imageStyle} />
            <div className="crop-editor__shade" style={rectStyle} />
          </div>
          <div className="crop-editor__rect" style={rectStyle}>
            <button
              ref={boxRef}
              type="button"
              className="crop-editor__box"
              aria-label={t.cropMove}
              aria-describedby={statusId}
              disabled={busy}
              {...pointer('move')}
            />
            {cropper.handles.map((h) => (
              <button
                key={h}
                type="button"
                className="crop-editor__handle"
                data-handle={h}
                aria-label={handleLabel(h)}
                aria-describedby={statusId}
                disabled={busy}
                {...pointer(h)}
              />
            ))}
          </div>
        </div>
      </div>
      <p id={statusId} role="status" className="crop-editor__readout">
        {t.cropArea(rect.width, rect.height)}
      </p>
      <div className="crop-editor__actions">
        <IconButton icon="rotateLeft" label={t.rotateLeft} disabled={busy} onClick={() => cropper.rotate(-1)} />
        <IconButton icon="rotateRight" label={t.rotateRight} disabled={busy} onClick={() => cropper.rotate(1)} />
        <Button variant="tertiary" disabled={busy} onClick={cropper.reset}>
          {t.cropReset}
        </Button>
        <span className="crop-editor__spacer" />
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          {t.cancel}
        </Button>
        <Button variant="primary" disabled={busy} onClick={apply}>
          {t.useCrop}
        </Button>
      </div>
    </div>
  )
}
