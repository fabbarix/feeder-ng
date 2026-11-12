import { useEffect, useId, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { IconButton } from '../IconButton'
import { Button } from '../Button'
import { handleLabel, type CropAspect, type Handle } from './lib/crop'
import type { ImageEdit } from './lib/edit'
import { useImageEditor } from './hooks/useImageEditor'
import { useViewWidth } from './hooks/useViewWidth'
import { imageEditorStrings as t } from './strings'
import './ImageEditor.css'

export interface ImageEditorProps {
  /** Object URL (or URL) of the picture, in its own (un-turned) orientation. */
  src: string
  /** The picture's own pixel size. */
  width: number
  height: number
  aspect: CropAspect
  /** The controlled edit (turns and crop). */
  value: ImageEdit
  onChange: (edit: ImageEdit) => void
  /** Smallest crop side in picture pixels (default 16). */
  minSide?: number
  busy?: boolean
  /** Focus the crop box when the editor opens. */
  autoFocus?: boolean
  /** Escape. */
  onCancel: () => void
  /** The host's own buttons, rendered after Rotate left, Rotate right and Reset. */
  children?: ReactNode
}

/**
 * The image editor: the picture, a crop box with resize handles, a read-out and the turn and reset buttons. Controlled: it shows `value`
 * and reports every change through `onChange`. Our primitives only (no native UI); keyboard and pointer share the same moves (lib/edit).
 */
export function ImageEditor({ src, width, height, aspect, value, onChange, minSide, busy, autoFocus, onCancel, children }: ImageEditorProps) {
  const statusId = useId()
  const { ref: stageRef, width: viewWidth } = useViewWidth()
  const editor = useImageEditor({ value, onChange, width, height, aspect, minSide, viewWidth })
  const boxRef = useRef<HTMLButtonElement>(null)
  const { bounds, percent } = editor

  useEffect(() => {
    if (autoFocus) boxRef.current?.focus()
  }, [autoFocus])

  /** Pointer events for the box ('move') and for each handle. The element captures the pointer so a drag outside it still counts. */
  const pointer = (kind: 'move' | Handle) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (busy || (e.button !== undefined && e.button > 0)) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      editor.begin(kind, e)
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => editor.drag(e),
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      editor.end(e)
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => editor.end(e),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      editor.key(kind, e)
    },
  })

  // The picture is shown turned: the stage has the TURNED shape, and the image (laid out in its own shape) is rotated inside it.
  const odd = value.turns % 2 === 1
  const imageStyle = {
    inlineSize: odd ? `${(100 * bounds.height) / bounds.width}%` : '100%',
    blockSize: odd ? `${(100 * bounds.width) / bounds.height}%` : '100%',
    transform: `translate(-50%, -50%) rotate(${value.turns * 90}deg)`,
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
      <div className="crop-editor__stage" data-dragging={editor.dragging || undefined}>
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
            {editor.handles.map((h) => (
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
        {editor.readout}
      </p>
      <div className="crop-editor__actions">
        <IconButton icon="rotateLeft" label={t.rotateLeft} disabled={busy} onClick={() => editor.rotate(-1)} />
        <IconButton icon="rotateRight" label={t.rotateRight} disabled={busy} onClick={() => editor.rotate(1)} />
        <Button variant="tertiary" disabled={busy} onClick={editor.reset}>
          {t.cropReset}
        </Button>
        {children ? <div className="crop-editor__confirm">{children}</div> : null}
      </div>
    </div>
  )
}
