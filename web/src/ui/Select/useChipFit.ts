// B9-15: whether a chip Select shows its full label (chipFit.ts). Measured after every render and again when its row resizes.
// Off (`enabled` false: not a chip, or no shortLabel chosen) it shows the full label and measures nothing.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { chipFitRows, chipShowsFull, measureChipFit } from './chipFit'

/** The chip's frame: the field around the Select (its item in the row), or the anchor itself. */
const frameOf = (anchor: HTMLElement | null) => anchor?.closest<HTMLElement>('.ui-field') ?? anchor

export function useChipFit(anchor: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [full, setFull] = useState(true)
  const fitRef = useRef<() => void>(() => {})
  const fullNow = useRef(full)

  useLayoutEffect(() => {
    fullNow.current = full
    fitRef.current = () => {
      const el = frameOf(anchor.current)
      setFull(!enabled || !el ? true : chipShowsFull(measureChipFit(el), fullNow.current))
    }
    fitRef.current()
  })

  useLayoutEffect(() => {
    const frame = frameOf(anchor.current)
    if (!enabled || !frame || typeof ResizeObserver === 'undefined') return
    // Each row the room is read from, and its items: a sibling that shortens or grows changes this chip's room without resizing the row,
    // and a content-sized row (the Shop chip's) does not resize when the row that holds it does.
    const observer = new ResizeObserver(() => fitRef.current())
    for (const row of chipFitRows(frame)) {
      observer.observe(row)
      for (const item of row.children) observer.observe(item)
    }
    return () => observer.disconnect()
  }, [anchor, enabled])

  return full
}
