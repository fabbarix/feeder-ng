// B9-38 (PC-10): a mouse or trackpad (no on-screen keyboard), read once when the sheet opens.
import { useState } from 'react'

export function useFinePointer(): boolean {
  const [fine] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches)
  return fine
}
