import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Avatar } from '../ui'
import type { NavItem } from './nav'
import { MENU_NAV, PRIMARY_NAV, sortByOrder } from './nav'
import { shellStrings } from './strings'

export interface AppShellProps {
  user: { displayName: string; imageUrl?: string }
  onSignOut: () => void
  /** Extra avatar-menu entries contributed by features. */
  navItems?: NavItem[]
}

/** The app frame: navigation on the phone bottom bar or the desktop side rail, the avatar menu, and the routed page. */
export function AppShell({ user, onSignOut, navItems = [] }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="top-bar__brand">{shellStrings.brand}</span>
        <YourMenu user={user} items={[...MENU_NAV, ...sortByOrder(navItems)]} onSignOut={onSignOut} />
      </header>
      <nav aria-label={shellStrings.sideRail} className="side-rail">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.id} to={item.path} end className="side-rail__link">
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
      <nav aria-label={shellStrings.bottomBar} className="bottom-bar">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end
            className="bottom-bar__link"
            data-raised={item.raised ? 'true' : undefined}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

interface YourMenuProps {
  user: AppShellProps['user']
  items: NavItem[]
  onSignOut: () => void
}

function YourMenu({ user, items, onSignOut }: YourMenuProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="your-menu-anchor">
      <button
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
        <div role="menu" className="your-menu">
          {items.map((item) => (
            <Link key={item.id} role="menuitem" to={item.path} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            {shellStrings.signOut}
          </button>
        </div>
      ) : null}
    </div>
  )
}
