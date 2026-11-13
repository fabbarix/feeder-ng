import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { BottomSheet } from '../BottomSheet'
import { Icon } from '../Icon'
import { IconButton } from '../IconButton'
import { Switch } from '../fields/Switch'
import type { IconName } from '../icons'
import { useMediaQuery } from '../lib/useMediaQuery'
import { ListGroup, ListRow } from '../ListRow'
import { useMenuKeys } from './useMenuKeys'
import './Menu.css'

/** One choice of a Menu. `href` makes it a link; `checked` makes it a checkable item (menuitemcheckbox). */
export interface MenuItem {
  id: string
  label: string
  icon?: IconName
  tone?: 'danger'
  href?: string
  checked?: boolean
  disabled?: boolean
  onSelect?: () => void
}
export interface MenuSeparator {
  separator: true
}
export type MenuEntry = MenuItem | MenuSeparator

export interface MenuProps {
  /** The trigger's accessible name and the menu's name ("More actions"). */
  label: string
  /** Trigger glyph. Default `more`. */
  icon?: IconName
  /** Title of the sheet below 768 px. Default: `label`. */
  title?: string
  /** The trigger's size: `compact` (32 px visual) for a slot header inside a day tile. Default `md`. */
  size?: 'md' | 'compact'
  items: MenuEntry[]
}

const GAP = 8
const isSeparator = (e: MenuEntry): e is MenuSeparator => 'separator' in e

interface Placed {
  top: number
  left: number
  placement: 'below' | 'above'
}

/** G-01: a popover anchored to its IconButton from 768 px; a BottomSheet of rows below. */
export function Menu({ label, icon = 'more', title, size = 'md', items }: MenuProps) {
  const wide = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <IconButton ref={triggerRef} icon={icon} label={label} size={size} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      {open && wide ? <Popover label={label} items={items} triggerRef={triggerRef} onClose={close} /> : null}
      {open && !wide ? <Sheet title={title ?? label} items={items} onClose={close} /> : null}
    </>
  )
}

function Popover({
  label,
  items,
  triggerRef,
  onClose,
}: {
  label: string
  items: MenuEntry[]
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<Placed | null>(null)
  const { onMenuKeyDown } = useMenuKeys({
    open: true,
    onClose,
    menuRef,
    triggerRef,
  })

  const place = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect()
    const m = menuRef.current?.getBoundingClientRect()
    if (!t || !m) return
    const below = t.bottom + GAP
    const fits = below + m.height <= window.innerHeight - GAP
    const top = fits ? below : Math.max(GAP, t.top - GAP - m.height)
    const left = Math.min(Math.max(GAP, t.right - m.width), Math.max(GAP, window.innerWidth - m.width - GAP))
    setPlaced({ top, left, placement: fits ? 'below' : 'above' })
  }, [triggerRef])

  useLayoutEffect(place, [place])

  // The popover is fixed, so it follows its trigger when the page (or any scroll container) scrolls or the window resizes.
  useEffect(() => {
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [place])

  // A pointer-down outside closes (the trigger toggles on its own click).
  useEffect(() => {
    const onDown = (e: PointerEvent | MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onClose, triggerRef])

  const select = (item: MenuItem, link: boolean) => {
    onClose()
    if (!link) triggerRef.current?.focus()
    item.onSelect?.()
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="menu"
      data-placement={placed?.placement ?? 'below'}
      style={{
        position: 'fixed',
        top: placed?.top ?? 0,
        left: placed?.left ?? 0,
        opacity: placed ? undefined : 0,
      }}
      onKeyDown={onMenuKeyDown}
    >
      {items.map((entry, i) =>
        isSeparator(entry) ? (
          <div key={`sep-${i}`} role="separator" className="menu__divider" />
        ) : (
          <PopoverItem key={entry.id} item={entry} onSelect={select} />
        ),
      )}
    </div>,
    document.body,
  )
}

function PopoverItem({ item, onSelect }: { item: MenuItem; onSelect: (item: MenuItem, link: boolean) => void }) {
  const common = {
    className: 'menu__item',
    'data-tone': item.tone,
    'aria-disabled': item.disabled ? (true as const) : undefined,
    tabIndex: -1,
  }
  const body: ReactNode = (
    <>
      {item.icon ? <Icon name={item.icon} size={20} /> : null}
      <span>{item.label}</span>
      {item.checked ? <Icon name="tick" size={20} className="menu__check" /> : null}
    </>
  )
  if (item.href !== undefined && item.checked === undefined) {
    return (
      <Link
        {...common}
        role="menuitem"
        to={item.href}
        onClick={(e) => {
          if (item.disabled) e.preventDefault()
          else onSelect(item, true)
        }}
      >
        {body}
      </Link>
    )
  }
  return (
    <button
      type="button"
      {...common}
      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={item.checked === undefined ? undefined : item.checked}
      onClick={() => {
        if (!item.disabled) onSelect(item, false)
      }}
    >
      {body}
    </button>
  )
}

function Sheet({ title, items, onClose }: { title: string; items: MenuEntry[]; onClose: () => void }) {
  const titleId = useId()
  const run = (item: MenuItem) => {
    onClose()
    item.onSelect?.()
  }
  return (
    <BottomSheet open onClose={onClose} title={title}>
      {/* A link row navigates on its own; the sheet closes with it. */}
      <div onClick={(e) => (e.target as HTMLElement).closest('a') && onClose()} data-menu-sheet={titleId}>
        <ListGroup label={title}>
          {items.map((entry, i) => {
            if (isSeparator(entry)) return <li key={`sep-${i}`} role="separator" className="menu-sheet__divider" />
            const tone = entry.tone
            const state = {
              'data-tone': tone,
              'data-disabled': entry.disabled ? 'true' : undefined,
            }
            if (entry.checked !== undefined) {
              return (
                <li key={entry.id} className="menu-sheet__switch" {...state}>
                  <Switch label={entry.label} checked={entry.checked} disabled={entry.disabled} onChange={() => run(entry)} />
                </li>
              )
            }
            if (entry.href !== undefined && !entry.disabled) return <ListRow key={entry.id} title={entry.label} icon={entry.icon} href={entry.href} {...state} />
            return (
              <ListRow
                key={entry.id}
                title={entry.label}
                icon={entry.icon}
                onActivate={entry.disabled ? undefined : () => run(entry)}
                {...state}
              />
            )
          })}
        </ListGroup>
      </div>
    </BottomSheet>
  )
}
