// The avatar menu (docs/design/ui-fix-plan.md 4.5, 5.17): shortcuts and feature items, a divider, Sign out.
import { useCallback, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccessBadge } from '../features/access/components/AccessBadge'
import { preferencePreview } from '../features/settings/lib/preferencePreview'
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
  // A11Y-12: the open menu is named by its button ("Your menu", with the request count when there are some).
  const buttonId = useId()

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
        id={buttonId}
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
          <div ref={menuRef} role="menu" aria-labelledby={buttonId} className="your-menu" onKeyDown={onMenuKeyDown}>
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
              onClick={() => {
                setOpen(false)
                // B9-36 (SAFE-08): with an unsaved preview of Your preferences, "Leave without saving?" comes first.
                void preferencePreview.confirmLeave().then((leave) => {
                  if (leave) onSignOut()
                })
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
