import { forwardRef, useImperativeHandle, useRef, type ChangeEvent } from 'react'

export interface FileButtonHandle {
  /** Opens the system camera app. */
  open(): void
}

export interface FileButtonProps {
  onFile: (file: File) => void
  disabled?: boolean
}

/**
 * The hidden `<input type=file accept="image/*" capture="environment">`: the camera app of a phone, used where `getUserMedia` is missing
 * (plain http), unreliable (iOS home-screen app) or refused. The visible "Take photo" / "Use the camera app" buttons call `open()`.
 */
export const FileButton = forwardRef<FileButtonHandle, FileButtonProps>(function FileButton({ onFile, disabled }, ref) {
  const input = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => ({ open: () => input.current?.click() }), [])
  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onFile(file)
  }
  return <input ref={input} type="file" accept="image/*" capture="environment" hidden disabled={disabled} onChange={change} />
})
