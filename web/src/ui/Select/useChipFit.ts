// B9-15: whether a chip Select shows its full label (chipFit.ts). Measured after every render and again when its row resizes.
// Off (`enabled` false: not a chip, or no shortLabel chosen) it shows the full label and measures nothing.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { chipShowsFull, measureChipFit } from './chipFit'

/** The chip's frame: the field around the Select (its item in the row), or the anchor itself. */
const frameOf = (anchor: HTMLElement | null) => anchor?.closest<HTMLElement>('.ui-field') ?? anchor

export function useChipFit(anchor: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [full, setFull] = useState(true)
  const fitRef = useRef<() => void>(() => {})

  useLayoutEffect(() => {
    fitRef.current = () => {
      const el = frameOf(anchor.current)
      setFull(!enabled || !el ? true : chipShowsFull(measureChipFit(el)))
    }
    fitRef.current()
  })

  useLayoutEffect(() => {
    const row = frameOf(anchor.current)?.parentElement
    if (!enabled || !row || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => fitRef.current())
    observer.observe(row)
    return () => observer.disconnect()
  }, [anchor, enabled])

  return full
}
