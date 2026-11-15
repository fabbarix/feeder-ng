import { QueryClientContext, type QueryClient } from '@tanstack/react-query'
import { Component, useContext, useEffect, useRef, type ReactNode } from 'react'
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router-dom'
import { Button, ErrorState } from '../ui'
import { useDocumentTitle } from '../ui/lib/useDocumentTitle'
import { overlayStrings } from '../ui/overlayStrings'
import { NotFound } from './NotFound'
import { routeQueryKeys } from './routeQueryKeys'
import { retryFailedChunks } from './routeChunks'
import { tryAgainMove } from './staleChunk'
import { shellStrings } from './strings'

/** B9-20 (RES-09): on Today, "Go to Today" would do nothing; the second action reloads Feeder instead. */
const RELOAD_FEEDER = 'Reload Feeder'

export interface PageErrorBoundaryProps {
  children: ReactNode
  /** The boundary resets when this changes (the pathname), so navigating away from a broken page recovers. */
  resetKey: string
}

interface BoundaryState {
  failed: boolean
}

/**
 * Error state shared by the in-shell boundary and the router errorElement. Never shows the error message or stack.
 * B9-20 (RES-09): Try again (primary) resets the route's queries, so cached bad data cannot crash the page again, and
 * then `onReset`; the secondary is Go to Today, or Reload Feeder on Today. Focus moves to the heading.
 */
function ErrorPage({ onReset }: { onReset: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const client = useContext(QueryClientContext)
  const box = useRef<HTMLDivElement>(null)

  // A11Y-01: the document says the page failed; the heading (the page's h1 while it shows) takes focus.
  useDocumentTitle([shellStrings.errorTitle])
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('.error-state__title')?.focus({ preventScroll: true })
  }, [])

  const tryAgain = () => {
    // B9-59: the page's code failed to load and the server now runs a newer version: only the new version can load it.
    if (tryAgainMove() === 'reload') {
      window.location.reload()
      return
    }
    retryFailedChunks() // a route chunk that failed to load is imported again (offline then back, a passing fault)
    if (client) for (const queryKey of routeQueryKeys(pathname)) void client.resetQueries({ queryKey })
    onReset()
  }
  const onToday = pathname === '/'

  return (
    <div ref={box}>
      {/* TB-15c: the shared ErrorState (danger tone, role="alert", the warning icon), not an accent EmptyState. */}
      <ErrorState
        title={shellStrings.errorTitle}
        headingLevel={1}
        headingId="page-title"
        message={shellStrings.errorText}
        actions={
          <>
            <Button variant="primary" onClick={tryAgain}>
              {overlayStrings.tryAgain}
            </Button>
            {onToday ? (
              <Button variant="secondary" onClick={() => window.location.reload()}>
                {RELOAD_FEEDER}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => navigate('/')}>
                {shellStrings.goToToday}
              </Button>
            )}
          </>
        }
      />
    </div>
  )
}

/** React error boundary around the shell's Outlet: the bars stay usable while the page is broken. */
export class PageErrorBoundary extends Component<PageErrorBoundaryProps, BoundaryState> {
  static contextType = QueryClientContext
  declare context: QueryClient | undefined
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  componentDidUpdate(previous: PageErrorBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      retryFailedChunks() // B9-59: a new visit is a new attempt at a route chunk that failed to load
      // B9-49 (RES-09): leaving a crashed page drops its route's cached queries, so coming back fetches them again rather than
      // rendering the bad data that crashed it (never the signed-in User: routeQueryKeys leaves ['me'] out).
      for (const queryKey of routeQueryKeys(previous.resetKey)) void this.context?.resetQueries({ queryKey })
      this.setState({ failed: false })
    }
  }

  private reset = () => this.setState({ failed: false })

  render() {
    return this.state.failed ? <ErrorPage onReset={this.reset} /> : this.props.children
  }
}

/** Router `errorElement` for the root route: loader and router errors, outside the shell. A 404 response shows Page not found. */
export function RouteErrorBoundary() {
  const error = useRouteError()
  const navigate = useNavigate()
  const location = useLocation()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />
  // Navigating to the same place again re-runs the route and clears the router's error.
  return <ErrorPage onReset={() => navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true })} />
}
