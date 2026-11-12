// The Photo panel's retake request: Retake closes the editor, and the system camera opens once the sources are back on screen.
import { useState } from 'react'

/** Retake asks for the system camera again once the editor has closed; PhotoSources clears the request when it has opened it. */
export function useRetakeRequest(): { openCamera: boolean; request: () => void; opened: () => void } {
  const [openCamera, setOpenCamera] = useState(false)
  return { openCamera, request: () => setOpenCamera(true), opened: () => setOpenCamera(false) }
}
