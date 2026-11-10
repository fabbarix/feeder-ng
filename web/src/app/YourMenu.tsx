// The avatar menu (docs/design/ui-fix-plan.md 4.5, 5.17): shortcuts, a divider, Settings, feature items, Sign out.
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Icon } from '../ui'
import type { NavItem } from './nav'
import { shellStrings } from './strings'

export interface YourMenuProps {
  user: { displayName: string; imageUrl?: string }
  items: NavItem[]
  onSignOut: () => void
}

const itemsIn = (menu: HTMLElement | null): HTMLElement[] =>
  menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : []

export function YourMenu({ user, items, onSignOut }: YourMenuProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Focus goes to the first item on open, never to a highlighted Sign out.
  useEffect(() => {
    if (open) itemsIn(menuRef.current)[0]?.focus()
  }, [open])

  // Escape closes from anywhere and returns focus to the avatar button.
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = itemsIn(menuRef.current)
    const current = list.indexOf(document.activeElement as HTMLElement)
    const last = list.length - 1
    const go = (to: number) => {
      e.preventDefault()
      list[to]?.focus()
    }
    switch (e.key) {
      case 'ArrowDown':
        go(current < 0 || current === last ? 0 : current + 1)
        break
      case 'ArrowUp':
        go(current <= 0 ? last : current - 1)
        break
      case 'Home':
        go(0)
        break
      case 'End':
        go(last)
        break
      case 'Tab':
        // Tab leaves the menu: it closes, and focus returns to the avatar button rather than falling to the page.
        e.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
        break
    }
  }

  return (
    <div className="your-menu-anchor">
      <button
        ref={buttonRef}
        type="button"
        className="your-menu-button"
        aria-label={shellStrings.yourMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={user.displayName} imageUrl={user.imageUrl} size="sm" />
      </button>
      {open ? (
        <>
          <div
            className="your-menu-scrim"
            data-testid="menu-scrim"
            aria-hidden="true"
            onClick={() => {
              setOpen(false)
              buttonRef.current?.focus()
            }}
          />
          <div ref={menuRef} role="menu" className="your-menu" onKeyDown={onMenuKeyDown}>
            {items.map((item) => (
              <Fragment key={item.id}>
                {item.id === 'settings' ? <div role="separator" className="your-menu__divider" /> : null}
                <Link role="menuitem" className="your-menu__item" to={item.path} onClick={() => setOpen(false)}>
                  <Icon name={item.icon ?? 'chevron'} size={20} />
                  <span>{item.label}</span>
                </Link>
              </Fragment>
            ))}
            <button
              type="button"
              role="menuitem"
              className="your-menu__item"
              data-tone="danger"
              onClick={() => {
                setOpen(false)
                onSignOut()
              }}
            >
              <Icon name="signOut" size={20} />
              <span>{shellStrings.signOut}</span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
