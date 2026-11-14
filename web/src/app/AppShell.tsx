import { Link, Outlet, useLocation } from 'react-router-dom'
import { Icon, Page, PageWidthProvider } from '../ui'
import { withAccessRequests } from './accessMenu'
import { BrandMark } from './BrandMark'
import { isChromeless } from './chromeless'
import { pageWidthFor } from './pageWidths'
import { PageErrorBoundary } from './PageErrorBoundary'
import type { NavItem } from './nav'
import { MENU_NAV, PRIMARY_NAV, RAIL_NAV, sortByOrder } from './nav'
import { isCurrentNav } from './navCurrent'
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
  /** Access Requests waiting for an answer: a badge on the avatar button and an item in its menu. */
  pendingAccessRequests?: number
}


/** The app frame: navigation on the phone bottom bar or the desktop side rail, the avatar menu, and the routed page. */
export function AppShell({ user, onSignOut, navItems = [], pendingScans, pendingAccessRequests = 0 }: AppShellProps) {
  const { pathname } = useLocation()
  const pageWidth = pageWidthFor(pathname)
  if (isChromeless(pathname)) {
    // The kitchen board, Cook Mode and the receipt screens: the page alone, no bars, no avatar menu, no status slot. A screen
    // that is a ui Page (the receipt ones) still takes its route's width from the table.
    return (
      <div className="app-shell app-shell--chromeless">
        <main className="app-main app-main--full">
          <PageWidthProvider value={pageWidth}>
            <PageErrorBoundary resetKey={pathname}>
              <Outlet />
            </PageErrorBoundary>
          </PageWidthProvider>
        </main>
      </div>
    )
  }
  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="top-bar__brand">
          <BrandMark />
          <span className="top-bar__brand-word">{shellStrings.brand}</span>
        </span>
        <YourMenu
          user={user}
          items={withAccessRequests([...MENU_NAV, ...sortByOrder(navItems)], pendingAccessRequests)}
          pendingAccessRequests={pendingAccessRequests}
          onSignOut={onSignOut}
        />
      </header>
      <div className="app-status">
        <ShellStatus pendingScans={pendingScans} />
      </div>
      <nav aria-label={shellStrings.sideRail} className="side-rail">
        {RAIL_NAV.map((item) => {
          const isActive = isCurrentNav(item, pathname)
          return (
            <Link
              key={item.id}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              className="side-rail__link"
              data-accent={item.accent ? 'true' : undefined}
            >
              <span className="side-rail__pill">
                <Icon name={item.icon} size={24} weight={isActive ? 'fill' : 'regular'} />
              </span>
              <span className="side-rail__label">{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <main className="app-main">
        <PageWidthProvider value={pageWidth}>
          <Page width={pageWidth}>
            <PageErrorBoundary resetKey={pathname}>
              <Outlet />
            </PageErrorBoundary>
          </Page>
        </PageWidthProvider>
      </main>
      <nav aria-label={shellStrings.bottomBar} className="bottom-bar">
        {PRIMARY_NAV.map((item) => {
          const isActive = isCurrentNav(item, pathname)
          return (
            <Link
              key={item.id}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              className="bottom-bar__link"
              data-accent={item.accent ? 'true' : undefined}
            >
              <Icon name={item.icon} size={item.accent ? 28 : 24} weight={isActive ? 'fill' : 'regular'} />
              <span className="bottom-bar__label">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
