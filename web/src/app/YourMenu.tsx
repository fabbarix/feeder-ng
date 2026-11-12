// The avatar menu (docs/design/ui-fix-plan.md 4.5, 5.17): shortcuts and feature items, a divider, Sign out.
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccessBadge } from '../features/access/components/AccessBadge'
import { accessStrings } from '../features/access/strings'
import { Avatar, Icon, useMenuKeys } from '../ui'
import { menuIconFor, type NavItem } from './nav'
import { shellStrings } from './strings'

export interface YourMenuProps {
  user: { displayName: string; imageUrl?: string }
  items: NavItem[]
  /** Shown as a count badge on the button and named in its label. */
  pendingAccessRequests?: number
  onSignOut: () => void
}

export function YourMenu({ user, items, pendingAccessRequests = 0, onSignOut }: YourMenuProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  // Focus on open, arrows, Home/End, Escape and Tab: the shared menu rules (ui/Menu).
  const { onMenuKeyDown } = useMenuKeys({
    open,
    onClose: close,
    menuRef,
    triggerRef: buttonRef,
  })

  return (
    <div className="your-menu-anchor">
      <button
        ref={buttonRef}
        type="button"
        className="your-menu-button"
        aria-label={
          pendingAccessRequests > 0
            ? `${shellStrings.yourMenu}, ${accessStrings.waitingLabel(pendingAccessRequests)}`
            : shellStrings.yourMenu
        }
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={user.displayName} imageUrl={user.imageUrl} size="sm" />
      </button>
      <AccessBadge count={pendingAccessRequests} />
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
              <Link key={item.id} role="menuitem" className="your-menu__item" to={item.path} onClick={() => setOpen(false)}>
                <Icon name={menuIconFor(item)} size={20} />
                <span>{item.label}</span>
              </Link>
            ))}
            <div role="separator" className="your-menu__divider" />
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
