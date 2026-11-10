import { Component, type ReactNode } from 'react'
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'
import { Button, EmptyState } from '../ui'
import { NotFound } from './NotFound'
import { shellStrings } from './strings'

export interface PageErrorBoundaryProps {
  children: ReactNode
  /** The boundary resets when this changes (the pathname), so navigating away from a broken page recovers. */
  resetKey: string
}

interface BoundaryState {
  failed: boolean
}

/** Error state shared by the in-shell boundary and the router errorElement. Never shows the error message or stack. */
function ErrorPage() {
  const navigate = useNavigate()
  return (
    <EmptyState
      icon="error"
      title={shellStrings.errorTitle}
      description={shellStrings.errorText}
      action={
        <>
          <Button variant="primary" onClick={() => window.location.reload()}>
            {shellStrings.reloadPage}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/')}>
            {shellStrings.goToToday}
          </Button>
        </>
      }
    />
  )
}

/** React error boundary around the shell's Outlet: the bars stay usable while the page is broken. */
export class PageErrorBoundary extends Component<PageErrorBoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  componentDidUpdate(previous: PageErrorBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    return this.state.failed ? <ErrorPage /> : this.props.children
  }
}

/** Router `errorElement` for the root route: loader and router errors, outside the shell. A 404 response shows Page not found. */
export function RouteErrorBoundary() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />
  return <ErrorPage />
}
