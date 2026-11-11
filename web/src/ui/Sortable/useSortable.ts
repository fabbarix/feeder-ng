import { flushSync } from 'react-dom'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, Ref } from 'react'
import { autoScrollDelta, displayOrder, exceedsThreshold, keyTarget, slotAt, type PointerKind, type Slot } from './reorder'
import { sortableStrings, type SortableStrings } from './strings'

export type SortableItemState = 'idle' | 'lifted' | 'dragging'

export type SortablePhase = { phase: 'idle' } | { phase: 'lifted' | 'dragging'; from: number; to: number }

export interface UseSortableOptions {
  count: number
  /** Name of the item at this original index, used by the handle label and every announcement. */
  labelOf: (index: number) => string
  /** Called once, on drop, when the item ended somewhere else. Never called on cancel. */
  onReorder: (from: number, to: number) => void
  strings?: SortableStrings
  disabled?: boolean
  /** Element that scrolls the list; default: the nearest scrollable ancestor of the list, else the window. */
  getScrollParent?: () => HTMLElement | null
}

export interface SortableHandleProps {
  ref: Ref<HTMLButtonElement>
  type: 'button'
  'aria-label': string
  'aria-describedby': string
  'aria-pressed': boolean
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  onBlur: () => void
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (e: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => void
  onContextMenu: (e: { preventDefault: () => void }) => void
}

export interface SortableItemProps {
  className?: string
  ref: Ref<HTMLLIElement>
  'data-sortable-item': ''
  'data-sortable-index': number
  'data-state': SortableItemState
  style?: CSSProperties
}

export interface UseSortableResult {
  state: SortablePhase
  /** Original indices in the order they are shown now (the preview while lifted or dragging). */
  order: number[]
  /** The sentence for the live region. */
  announcement: string
  instructionsId: string
  instructions: string
  getHandleProps: (index: number) => SortableHandleProps
  getItemProps: (index: number) => SortableItemProps
}

interface PointerDrag {
  index: number
  pointerId: number
  kind: PointerKind
  startX: number
  startY: number
  lastY: number
  /** Page scroll travelled since the drag began (px), so the start snapshot stays comparable. */
  scrolled: number
  started: boolean
  slots: Slot[]
  handle: Element | null
  scroller: HTMLElement | null
  frame: number | null
}

interface DocHandlers {
  move: (e: globalThis.PointerEvent) => void
  up: (e: globalThis.PointerEvent) => void
  cancel: (e: globalThis.PointerEvent) => void
  key: (e: globalThis.KeyboardEvent) => void
  blur: () => void
}

const pointerKindOf = (t: string): PointerKind => (t === 'touch' || t === 'pen' ? t : 'mouse')

const isScrollable = (el: HTMLElement): boolean => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight

function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    if (isScrollable(p)) return p
  }
  return null
}

/**
 * The state machine of a sortable list (docs/dev/design/sort-drag.md): keyboard lift/move/drop/cancel, pointer drag with
 * thresholds, auto-scroll and live-region announcements. It only previews the order; `onReorder` runs once, on drop.
 */
export function useSortable(opts: UseSortableOptions): UseSortableResult {
  const { count, labelOf, onReorder, disabled = false, getScrollParent } = opts
  const strings = opts.strings ?? sortableStrings
  const instructionsId = useId()
  const [phase, setPhase] = useState<SortablePhase>({ phase: 'idle' })
  const [offset, setOffset] = useState({ dy: 0, shift: 0 })
  const [announcement, setAnnouncement] = useState('')

  // Latest values for the long-lived document listeners.
  const live = useRef({
    count,
    labelOf,
    onReorder,
    strings,
    getScrollParent,
    phase,
  })
  live.current = { count, labelOf, onReorder, strings, getScrollParent, phase }

  const itemEls = useRef(new Map<number, HTMLElement | null>())
  const handleEls = useRef(new Map<number, HTMLButtonElement | null>())
  const itemRefs = useRef(new Map<number, (el: HTMLElement | null) => void>())
  const handleRefs = useRef(new Map<number, (el: HTMLButtonElement | null) => void>())
  const drag = useRef<PointerDrag | null>(null)
  // Stable document listeners that call the latest handlers, so add and remove always see the same functions.
  const handlers = useRef<DocHandlers | null>(null)
  const listeners = useRef<DocHandlers>({
    move: (e) => handlers.current?.move(e),
    up: (e) => handlers.current?.up(e),
    cancel: (e) => handlers.current?.cancel(e),
    key: (e) => handlers.current?.key(e),
    blur: () => handlers.current?.blur(),
  })
  const lastSaid = useRef('')
  const sayTimer = useRef<number | null>(null)
  const refocus = useRef<number | null>(null)

  const say = useCallback((text: string) => {
    if (sayTimer.current !== null) cancelAnimationFrame(sayTimer.current)
    sayTimer.current = null
    if (text === lastSaid.current) {
      // The same sentence again: clear first so assistive technology reads it once more.
      setAnnouncement('')
      sayTimer.current = requestAnimationFrame(() => {
        sayTimer.current = null
        setAnnouncement(text)
      })
    } else setAnnouncement(text)
    lastSaid.current = text
  }, [])

  // The pick up and the first slot change can arrive in one pointer move: the pick up is carried into the second sentence,
  // so the later announcement never replaces the earlier one unheard.
  const carry = useRef('')

  // React moves keyed nodes with insertBefore, which can drop focus: put it back on the lifted handle.
  useLayoutEffect(() => {
    const index = refocus.current
    if (index === null) return
    handleEls.current.get(index)?.focus()
    refocus.current = null
  })

  const setTo = useCallback((from: number, to: number, kind: 'lifted' | 'dragging') => setPhase({ phase: kind, from, to }), [])

  // ---- pointer ----------------------------------------------------------------------------------------------------

  const removeListeners = useCallback(() => {
    const l = listeners.current
    document.removeEventListener('pointermove', l.move)
    document.removeEventListener('pointerup', l.up)
    document.removeEventListener('pointercancel', l.cancel)
    document.removeEventListener('keydown', l.key, true)
    window.removeEventListener('blur', l.blur)
  }, [])

  const stopPointer = useCallback(() => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (d.frame !== null) cancelAnimationFrame(d.frame)
    removeListeners()
    try {
      d.handle?.releasePointerCapture?.(d.pointerId)
    } catch {
      /* the capture is already gone */
    }
  }, [removeListeners])

  /** Recomputes the target slot and the drag offset from the last pointer position. */
  const refresh = useCallback(
    (d: PointerDrag) => {
      const { count: n, labelOf: label, strings: words } = live.current
      const y = d.lastY + d.scrolled
      const to = slotAt(d.slots, y)
      const from = d.index
      const own = d.slots[from]
      let shift = 0
      if (own && d.slots[to]) {
        const natural = to > from ? d.slots[to]!.bottom - (own.bottom - own.top) : d.slots[to]!.top
        shift = natural - own.top
      }
      const prev = live.current.phase
      setOffset({ dy: d.lastY - d.startY + d.scrolled, shift })
      if (prev.phase !== 'dragging' || prev.to !== to) {
        setTo(from, to, 'dragging')
        live.current.phase = { phase: 'dragging', from, to }
        if (prev.phase === 'dragging') {
          const moved = words.moved(label(from), to + 1, n)
          say(carry.current ? `${carry.current} ${moved}` : moved)
        }
      }
    },
    [say, setTo],
  )

  const tick = useCallback(() => {
    const d = drag.current
    if (!d) return
    d.frame = null
    const scroller = d.scroller
    const bounds = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    const step = autoScrollDelta(d.lastY, bounds)
    if (step !== 0) {
      const before = scroller ? scroller.scrollTop : window.scrollY
      if (scroller) scroller.scrollBy(0, step)
      else window.scrollBy(0, step)
      const after = scroller ? scroller.scrollTop : window.scrollY
      d.scrolled += after - before
      refresh(d)
    }
    d.frame = requestAnimationFrame(tick)
  }, [refresh])

  const finish = useCallback(
    (commit: boolean) => {
      const d = drag.current
      if (!d) return
      const started = d.started
      const from = d.index
      const cur = live.current.phase
      const to = cur.phase === 'dragging' ? cur.to : from
      const { count: n, labelOf: label, strings: words, onReorder: reorder } = live.current
      stopPointer()
      if (!started) return
      // Flushed at once: Escape arrives from a document listener, outside any React event.
      flushSync(() => {
        setPhase({ phase: 'idle' })
        setOffset({ dy: 0, shift: 0 })
      })
      live.current.phase = { phase: 'idle' }
      if (commit && to !== from) {
        reorder(from, to)
        say(words.dropped(label(from), to + 1, n))
      } else if (commit) say(words.droppedUnchanged(label(from), from + 1, n))
      else say(words.cancelled(label(from), from + 1, n))
    },
    [say, stopPointer],
  )

  const onDocMove = useCallback(
    (e: globalThis.PointerEvent) => {
      const d = drag.current
      if (!d || e.pointerId !== d.pointerId) return
      // The button was released outside the window and no pointerup came: finish the drag where it is.
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        finish(true)
        return
      }
      d.lastY = e.clientY
      if (!d.started) {
        if (!exceedsThreshold(e.clientX - d.startX, e.clientY - d.startY, d.kind)) return
        d.started = true
        const { count: n, labelOf: label, strings: words } = live.current
        setTo(d.index, d.index, 'dragging')
        live.current.phase = { phase: 'dragging', from: d.index, to: d.index }
        carry.current = words.liftedPointer(label(d.index), d.index + 1, n)
        say(carry.current)
        d.frame = requestAnimationFrame(tick)
      }
      refresh(d)
      carry.current = ''
    },
    [finish, refresh, say, setTo, tick],
  )
  const onDocUp = useCallback(
    (e: globalThis.PointerEvent) => {
      if (drag.current && e.pointerId === drag.current.pointerId) finish(true)
    },
    [finish],
  )
  const onDocCancel = useCallback(
    (e: globalThis.PointerEvent) => {
      if (drag.current && e.pointerId === drag.current.pointerId) finish(false)
    },
    [finish],
  )
  const onDocKey = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      finish(false)
    },
    [finish],
  )
  const onWindowBlur = useCallback(() => finish(false), [finish])
  handlers.current = { move: onDocMove, up: onDocUp, cancel: onDocCancel, key: onDocKey, blur: onWindowBlur }

  useEffect(
    () => () => {
      const d = drag.current
      if (d?.frame != null) cancelAnimationFrame(d.frame)
      drag.current = null
      removeListeners()
      if (sayTimer.current !== null) cancelAnimationFrame(sayTimer.current)
    },
    [removeListeners],
  )

  const startPointer = (index: number, e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || drag.current || live.current.phase.phase !== 'idle') return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const first = itemEls.current.get(0)
    const slots: Slot[] = Array.from({ length: live.current.count }, (_, i) => {
      const r = itemEls.current.get(i)?.getBoundingClientRect()
      return { top: r?.top ?? 0, bottom: r?.bottom ?? 0 }
    })
    const handle = e.currentTarget
    try {
      handle.setPointerCapture?.(e.pointerId)
    } catch {
      /* the pointer is gone already */
    }
    drag.current = {
      index,
      pointerId: e.pointerId,
      kind: pointerKindOf(e.pointerType),
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      scrolled: 0,
      started: false,
      slots,
      handle,
      scroller: live.current.getScrollParent ? live.current.getScrollParent() : scrollParentOf(first ?? null),
      frame: null,
    }
    const l = listeners.current
    document.addEventListener('pointermove', l.move)
    document.addEventListener('pointerup', l.up)
    document.addEventListener('pointercancel', l.cancel)
    document.addEventListener('keydown', l.key, true)
    window.addEventListener('blur', l.blur)
  }

  // ---- keyboard ---------------------------------------------------------------------------------------------------

  const cancelKeyboard = () => {
    const cur = live.current.phase
    if (cur.phase !== 'lifted') return
    setPhase({ phase: 'idle' })
    live.current.phase = { phase: 'idle' }
    say(strings.cancelled(labelOf(cur.from), cur.from + 1, count))
  }

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLButtonElement>) => {
    const cur = live.current.phase
    if (cur.phase === 'idle') {
      if (disabled || (e.key !== ' ' && e.key !== 'Spacebar')) return
      e.preventDefault()
      setPhase({ phase: 'lifted', from: index, to: index })
      live.current.phase = { phase: 'lifted', from: index, to: index }
      say(strings.liftedKeyboard(labelOf(index), index + 1, count))
      return
    }
    if (cur.phase !== 'lifted' || cur.from !== index) return
    const label = labelOf(cur.from)
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      setPhase({ phase: 'idle' })
      live.current.phase = { phase: 'idle' }
      if (cur.to !== cur.from) {
        onReorder(cur.from, cur.to)
        say(strings.dropped(label, cur.to + 1, count))
      } else say(strings.droppedUnchanged(label, cur.from + 1, count))
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancelKeyboard()
      return
    }
    const target = keyTarget(e.key, cur.to, count)
    if (target === null) return
    e.preventDefault()
    if (target === cur.to) {
      say(strings.atEdge(label, e.key === 'ArrowUp' || e.key === 'Home' ? 'first' : 'last'))
      return
    }
    refocus.current = cur.from
    setPhase({ phase: 'lifted', from: cur.from, to: target })
    live.current.phase = { phase: 'lifted', from: cur.from, to: target }
    say(strings.moved(label, target + 1, count))
  }

  // ---- props ------------------------------------------------------------------------------------------------------

  const cached = <E>(cache: Map<number, (el: E | null) => void>, store: Map<number, E | null>, index: number) => {
    let ref = cache.get(index)
    if (!ref) {
      ref = (el) => void store.set(index, el)
      cache.set(index, ref)
    }
    return ref
  }

  const pressed = phase.phase !== 'idle' ? phase.from : -1
  const dragged = phase.phase === 'dragging' ? phase.from : -1

  return {
    state: phase,
    order: phase.phase === 'idle' ? Array.from({ length: count }, (_, i) => i) : displayOrder(count, phase.from, phase.to),
    announcement,
    instructionsId,
    instructions: strings.instructions,
    getHandleProps: (index) => ({
      ref: cached<HTMLButtonElement>(handleRefs.current, handleEls.current, index),
      type: 'button',
      'aria-label': strings.handleLabel(labelOf(index)),
      'aria-describedby': instructionsId,
      'aria-pressed': pressed === index,
      onKeyDown: (e) => onKeyDown(index, e),
      onBlur: () => {
        // A move that reorders the DOM can blur the handle for a moment; that is not the user leaving.
        if (refocus.current !== null) return
        cancelKeyboard()
      },
      onPointerDown: (e) => startPointer(index, e),
      // Move, up and cancel are heard on the document while a drag is live (a reordered node loses its pointer capture).
      onPointerMove: () => {},
      onPointerUp: () => {},
      onPointerCancel: () => {},
      onContextMenu: (e) => e.preventDefault(),
    }),
    getItemProps: (index) => {
      const props: SortableItemProps = {
        ref: cached<HTMLElement>(itemRefs.current, itemEls.current, index) as Ref<HTMLLIElement>,
        className: 'sortable__item',
        'data-sortable-item': '',
        'data-sortable-index': index,
        'data-state': index === dragged ? 'dragging' : index === pressed ? 'lifted' : 'idle',
      }
      if (index === dragged)
        props.style = {
          '--sortable-dy': `${offset.dy}px`,
          '--sortable-shift': `${offset.shift}px`,
        } as CSSProperties
      return props
    },
  }
}
