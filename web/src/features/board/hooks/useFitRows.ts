import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** How far (px) a row may reach past the tile's padding edge and still count as shown whole (sub-pixel rounding). */
const SLACK = 1

/**
 * B9-47 (TB-07: nothing spills, clips mid-line or scrolls): how many of a list's `count` rows its tile shows whole. A wall tile has a
 * fixed height and clips, so a list that would run past the tile's padding edge shows fewer rows (the tile then says "+n more").
 * It starts from every row and drops one at a time while the last thing in the tile (a row, or the "+n more" line) is cut, and
 * starts again when the tile changes size or the rows change. A tile that does not clip (the scroll layout) or grows with its content
 * (the phone layout) shows every row. `ref` goes on the list.
 */
export function useFitRows<T extends HTMLElement>(count: number, key: unknown = count): { ref: RefObject<T | null>; shown: number } {
  const ref = useRef<T>(null)
  const [state, setState] = useState({ key, count, shown: count })
  const [size, setSize] = useState(0)
  // a new list or a new tile size: start again from every row
  if (state.key !== key || state.count !== count) setState({ key, count, shown: count })

  useLayoutEffect(() => {
    const list = ref.current
    const tile = list?.closest<HTMLElement>('.tile')
    if (!list || !tile || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setSize((n) => n + 1))
    observer.observe(tile)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    setState((s) => (s.shown === s.count ? s : { ...s, shown: s.count }))
  }, [size])

  useLayoutEffect(() => {
    const list = ref.current
    const tile = list?.closest<HTMLElement>('.tile')
    if (!list || !tile || state.shown <= 1) return
    const style = getComputedStyle(tile)
    if (style.overflowY === 'visible' || style.overflow === 'visible') return
    const edge = tile.getBoundingClientRect().bottom - parseFloat(style.paddingBottom || '0') - parseFloat(style.borderBottomWidth || '0')
    // the last row, and whatever follows the list in the tile (the "+n more" line)
    const bottoms = [list.lastElementChild, tile.lastElementChild === list ? null : tile.lastElementChild].map((e) => e?.getBoundingClientRect().bottom ?? 0)
    const bottom = Math.max(...bottoms)
    if (bottom > edge + SLACK) setState((s) => ({ ...s, shown: Math.max(1, s.shown - 1) }))
  }, [state])

  return { ref, shown: Math.min(state.shown, count) }
}
