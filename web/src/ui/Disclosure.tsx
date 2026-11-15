import { useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from './Icon'
import './Disclosure.css'

/** Sent on a Disclosure's section to open it at once (focusFirstInvalid sends it before it focuses a field inside). */
export const DISCLOSURE_OPEN_EVENT = 'feeder:disclosure-open'

export interface DisclosureHandle {
  open(): void
}

export interface DisclosureProps {
  /** The section's id: the hash `#id` opens it, and `persistKey` remembers it by this id. */
  id: string
  title: string
  /** One line that says what a closed section holds ("Main · quick, family · Cool-down 5 days"). Stays visible when open. */
  summary?: ReactNode
  /** Heading level. Default 2. */
  level?: 2 | 3 | 4
  /** A localStorage key holding the ids of the open sections on this device. One key serves a whole screen. */
  persistKey?: string
  defaultOpen?: boolean
  /** A field inside has an error: opens it (never closes it, and is not remembered). */
  invalid?: boolean
  onOpenChange?: (open: boolean) => void
  ref?: Ref<DisclosureHandle>
  children: ReactNode
}

function readOpenIds(key: string | undefined): string[] {
  if (!key) return []
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null')
    return Array.isArray(stored) ? stored.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function writeOpenId(key: string, id: string, open: boolean) {
  const ids = new Set(readOpenIds(key))
  if (open) ids.add(id)
  else ids.delete(id)
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]))
  } catch {
    // Storage blocked: the section still toggles, it is just not remembered.
  }
}

const hashNames = (id: string) => window.location.hash === `#${id}`

/**
 * A section Tile whose heading is the toggle (RX-02). The body stays mounted while closed, so a draft survives and an invalid
 * field inside can still be found. It opens on a click, when `invalid` turns true, on `ref.open()`, on DISCLOSURE_OPEN_EVENT and
 * when the hash names it; only the person closes it.
 */
export function Disclosure({ id, title, summary, level = 2, persistKey, defaultOpen, invalid, onOpenChange, ref, children }: DisclosureProps) {
  const [open, setOpen] = useState(() => Boolean(defaultOpen) || readOpenIds(persistKey).includes(id) || hashNames(id))
  const section = useRef<HTMLElement>(null)
  const uid = useId()
  const headingId = `${uid}-heading`
  const bodyId = `${uid}-body`

  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), [])

  useEffect(() => {
    if (invalid) setOpen(true)
  }, [invalid])

  useEffect(() => {
    const onHash = () => {
      if (hashNames(id)) setOpen(true)
    }
    const onOpenEvent = () => flushSync(() => setOpen(true))
    const el = section.current
    window.addEventListener('hashchange', onHash)
    el?.addEventListener(DISCLOSURE_OPEN_EVENT, onOpenEvent)
    return () => {
      window.removeEventListener('hashchange', onHash)
      el?.removeEventListener(DISCLOSURE_OPEN_EVENT, onOpenEvent)
    }
  }, [id])

  const toggle = () => {
    const next = !open
    setOpen(next)
    onOpenChange?.(next)
    if (persistKey) writeOpenId(persistKey, id, next)
  }

  const Heading = `h${level}` as const
  return (
    <section ref={section} id={id} className="tile disclosure" data-variant="surface" data-disclosure="" aria-labelledby={headingId}>
      <Heading id={headingId} className="disclosure__heading">
        <button type="button" className="disclosure__button" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <span className="disclosure__text">
            <span className="disclosure__title">{title}</span>
            {summary ? <span className="disclosure__summary">{summary}</span> : null}
          </span>
          <span className="disclosure__caret">
            <Icon name="caretDown" />
          </span>
        </button>
      </Heading>
      <div id={bodyId} className="disclosure__body" hidden={!open}>
        {children}
      </div>
    </section>
  )
}
