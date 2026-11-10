import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon } from '../ui'
import { isChromeless } from './chromeless'
import { PageErrorBoundary } from './PageErrorBoundary'
import type { NavItem } from './nav'
import { MENU_NAV, PRIMARY_NAV, RAIL_NAV, sortByOrder } from './nav'
import { ShellStatus } from './ShellStatus'
import { shellStrings } from './strings'
import { YourMenu } from './YourMenu'
import './shell.css'

export interface AppShellProps {
  user: { displayName: string; imageUrl?: string }
  onSignOut: () => void
  /** Extra avatar-menu entries contributed by features. */
  navItems?: NavItem[]
  /** Scans waiting to sync, shown by the OfflineBanner slot (fed by the scan feature's queue). */
  pendingScans?: number
}

/** The app frame: navigation on the phone bottom bar or the desktop side rail, the avatar menu, and the routed page. */
export function AppShell({ user, onSignOut, navItems = [], pendingScans }: AppShellProps) {
  const { pathname } = useLocation()
  if (isChromeless(pathname)) {
    // The kitchen board and Cook Mode: the page alone, no bars, no avatar menu, no status slot.
    return (
      <div className="app-shell app-shell--chromeless">
        <main className="app-main app-main--full">
          <PageErrorBoundary resetKey={pathname}>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    )
  }
  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="top-bar__brand">{shellStrings.brand}</span>
        <YourMenu user={user} items={[...MENU_NAV, ...sortByOrder(navItems)]} onSignOut={onSignOut} />
      </header>
      <div className="app-status">
        <ShellStatus pendingScans={pendingScans} />
      </div>
      <nav aria-label={shellStrings.sideRail} className="side-rail">
        {RAIL_NAV.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end
            className="side-rail__link"
            data-accent={item.accent ? 'true' : undefined}
          >
            {({ isActive }) => (
              <>
                <span className="side-rail__pill">
                  <Icon name={item.icon} size={24} weight={isActive ? 'fill' : 'regular'} />
                </span>
                <span className="side-rail__label">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <main className="app-main">
        <PageErrorBoundary resetKey={pathname}>
          <Outlet />
        </PageErrorBoundary>
      </main>
      <nav aria-label={shellStrings.bottomBar} className="bottom-bar">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end
            className="bottom-bar__link"
            data-accent={item.accent ? 'true' : undefined}
          >
            {({ isActive }) => (
              <>
                <Icon
                  name={item.icon}
                  size={item.accent ? 28 : 24}
                  weight={isActive ? 'fill' : 'regular'}
                />
                <span className="bottom-bar__label">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
