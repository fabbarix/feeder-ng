import { useContext, useEffect, useLayoutEffect, type MouseEvent } from 'react'
import { Link, Outlet, UNSAFE_DataRouterContext, useLocation } from 'react-router-dom'
import { Icon, Page, PageWidthProvider } from '../ui'
import { useKeyboardInset } from '../ui/lib/useKeyboardInset'
import { withAccessRequests } from './accessMenu'
import { BrandMark } from './BrandMark'
import { isChromeless, isReceiptScreen } from './chromeless'
import { pageWidthFor } from './pageWidths'
import { PageErrorBoundary } from './PageErrorBoundary'
import type { NavItem } from './nav'
import { MENU_NAV, PRIMARY_NAV, RAIL_NAV, sortByOrder } from './nav'
import { isCurrentNav } from './navCurrent'
import { reassertDocumentTitle } from '../ui/lib/useDocumentTitle'
import { routeTitle } from './routeTitle'
import { ShellStatus } from './ShellStatus'
import { ShellTimers } from './ShellTimers'
import { shellStrings } from './strings'
import { focusPageStart, useRouteFocus } from './useRouteFocus'
import { YourMenu } from './YourMenu'
import './shell.css'

export interface AppShellProps {
  user: { displayName: string; imageUrl?: string }
  onSignOut: () => void
  /** Extra avatar-menu entries contributed by features. */
  navItems?: NavItem[]
  /** Scans waiting to sync, shown by the OfflineBanner slot (fed by the scan feature's queue). */
  pendingScans?: number
  /** B9-49 (RES-07): Ticks waiting to sync, shown by the same slot (fed by the shop feature's queue). */
  pendingTicks?: number
  /** Access Requests waiting for an answer: a badge on the avatar button and an item in its menu. */
  pendingAccessRequests?: number
  /** B9-59: a nav link was pressed or focused; the app prefetches that route's code (app/prefetch.ts). */
  onNavIntent?: (path: string) => void
}

/** PC-04: the shell's timers, keyed so React keeps the one mounted ShellTimers when the cook moves between a framed page and a
 * receipt screen (same root element, same key): one poll, one alarm, and a ringing timer keeps ringing. */
const SHELL_TIMERS_KEY = 'shell-timers'

/** A11Y-01: the page's id for its h1 (ui/PageHeader) and <main>'s, the two focus targets. */
const MAIN_ID = 'main-content'

/** A11Y-01: before a page's own h1 names it (its code or data still loading, an error), the document title is its section's; a page
 *  whose h1 is already mounted has set its own title, and the shell never overwrites it. The provisional title is set the moment
 *  the router moves (before React renders the new page, whose PageHeader then names it), so the last page's title never lingers. */
function useProvisionalTitle(pathname: string): void {
  const router = useContext(UNSAFE_DataRouterContext)?.router
  useLayoutEffect(() => {
    if (!document.getElementById('page-title')) document.title = routeTitle(pathname)
  }, [pathname])
  // After the page's own effects (a parent's run last): a page still mounted from the last route, with the same title, never set its
  // title again, so the provisional one set on the move would stay; give it back its own.
  useEffect(() => {
    reassertDocumentTitle()
  }, [pathname])
  useEffect(() => {
    if (!router) return
    let shown = router.state.location.pathname
    return router.subscribe((state) => {
      if (state.location.pathname === shown) return
      shown = state.location.pathname
      document.title = routeTitle(shown)
    })
  }, [router])
}

/** A11Y-10: the skip link moves focus to the page start (its h1, else <main>) without following the hash, so the route stays. */
function skipToContent(event: MouseEvent<HTMLAnchorElement>): void {
  if (focusPageStart()) event.preventDefault()
}

/** The app frame: navigation on the phone bottom bar or the desktop side rail, the avatar menu, and the routed page. */
export function AppShell({ user, onSignOut, navItems = [], pendingScans, pendingTicks, pendingAccessRequests = 0, onNavIntent }: AppShellProps) {
  const { pathname } = useLocation()
  const pageWidth = pageWidthFor(pathname)
  // A11Y-01: both frames name the page and move focus to it on a route change.
  useProvisionalTitle(pathname)
  useRouteFocus()
  // Mounted before the chromeless return so both frames get it: the receipt screens carry a sticky Save bar there too.
  useKeyboardInset()
  if (isChromeless(pathname)) {
    // The kitchen board, Cook Mode and the receipt screens: the page alone, no bars, no avatar menu, no status slot. A screen
    // that is a ui Page (the receipt ones) still takes its route's width from the table.
    return (
      <div className="app-shell app-shell--chromeless">
        <main id={MAIN_ID} tabIndex={-1} className="app-main app-main--full">
          <PageWidthProvider value={pageWidth}>
            <PageErrorBoundary resetKey={pathname}>
              <Outlet />
            </PageErrorBoundary>
          </PageWidthProvider>
        </main>
        {/* PC-04: a timer can finish while the cook is on a receipt screen: the finish banner shows there (no pill: Save is there). */}
        {isReceiptScreen(pathname) ? <ShellTimers key={SHELL_TIMERS_KEY} pill={false} /> : null}
      </div>
    )
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href={`#${MAIN_ID}`} onClick={skipToContent}>
        {shellStrings.skipToContent}
      </a>
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
      {/* PC-04: the timer pill, finish banner and Timers sheet, mounted once for the framed pages (one poll, one alarm). */}
      <ShellTimers key={SHELL_TIMERS_KEY} />
      <div className="app-status" data-page-width={pageWidth}>
        <ShellStatus pendingScans={pendingScans} pendingTicks={pendingTicks} />
      </div>
      <nav aria-label={shellStrings.mainNav} className="side-rail">
        {RAIL_NAV.map((item) => {
          const isActive = isCurrentNav(item, pathname)
          return (
            <Link
              key={item.id}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              className="side-rail__link"
              onPointerDown={onNavIntent ? () => onNavIntent(item.path) : undefined}
              onFocus={onNavIntent ? () => onNavIntent(item.path) : undefined}
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
      <main id={MAIN_ID} tabIndex={-1} className="app-main">
        <PageWidthProvider value={pageWidth}>
          <Page width={pageWidth}>
            <PageErrorBoundary resetKey={pathname}>
              <Outlet />
            </PageErrorBoundary>
          </Page>
        </PageWidthProvider>
      </main>
      <nav aria-label={shellStrings.mainNav} className="bottom-bar">
        {PRIMARY_NAV.map((item) => {
          const isActive = isCurrentNav(item, pathname)
          return (
            <Link
              key={item.id}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              className="bottom-bar__link"
              onPointerDown={onNavIntent ? () => onNavIntent(item.path) : undefined}
              onFocus={onNavIntent ? () => onNavIntent(item.path) : undefined}
              data-accent={item.accent ? 'true' : undefined}
            >
              <span className="bottom-bar__icon" aria-hidden="true">
                <Icon name={item.icon} size={item.accent ? 28 : 24} weight={isActive ? 'fill' : 'regular'} />
              </span>
              <span className="bottom-bar__label">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
