// B9-20 (RES-09): a tile that throws keeps its slot and says so; the rest of the page works. Try again resets the tile's
// queries (so cached bad data cannot crash it again) and the boundary, then focus goes to the tile's heading.
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { Component, createRef, type ReactNode } from 'react'
import { Button, Icon } from '../ui'
import { overlayStrings } from '../ui/overlayStrings'
import './TileErrorBoundary.css'

export interface TileErrorBoundaryProps {
  title: string
  /** the tile's query keys, reset on Try again */
  queryKeys?: ReadonlyArray<readonly unknown[]>
  /** the page's name for "The rest of {scope} is fine." Default "Today". */
  scope?: string
  resetKeys?: ReadonlyArray<unknown>
  children: ReactNode
}

export const tileErrorStrings = {
  title: (tile: string) => `${tile} couldn’t be shown.`,
  rest: (scope: string) => `The rest of ${scope} is fine.`,
}

/** How long Try again waits for the tile's heading to appear (its data may still be loading). */
const FOCUS_WAIT_MS = 10_000

interface InnerProps extends TileErrorBoundaryProps {
  client: QueryClient
}

class TileBoundary extends Component<InnerProps, { failed: boolean }> {
  state = { failed: false }
  private box = createRef<HTMLDivElement>()
  private watch: { observer: MutationObserver; timer: ReturnType<typeof setTimeout> } | null = null

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  componentDidUpdate(previous: InnerProps) {
    if (this.state.failed && changed(previous.resetKeys, this.props.resetKeys)) this.setState({ failed: false })
    if (this.state.failed) this.stopWatch()
  }

  componentWillUnmount() {
    this.stopWatch()
  }

  private retry = () => {
    for (const queryKey of this.props.queryKeys ?? []) void this.props.client.resetQueries({ queryKey: queryKey as QueryKey })
    this.setState({ failed: false }, () => this.focusHeadingWhenBack())
  }

  /** Focus the tile's first h2/h3 once it renders, so a screen-reader User learns the tile is back. */
  private focusHeadingWhenBack() {
    this.stopWatch()
    const box = this.box.current
    if (!box || this.state.failed) return
    const tryFocus = (): boolean => {
      const heading = box.querySelector<HTMLElement>('h2, h3')
      if (!heading) return false
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
      heading.focus()
      return true
    }
    if (tryFocus()) return
    const observer = new MutationObserver(() => {
      if (tryFocus()) this.stopWatch()
    })
    observer.observe(box, { childList: true, subtree: true })
    this.watch = { observer, timer: setTimeout(() => this.stopWatch(), FOCUS_WAIT_MS) }
  }

  private stopWatch() {
    if (!this.watch) return
    this.watch.observer.disconnect()
    clearTimeout(this.watch.timer)
    this.watch = null
  }

  render() {
    const { title, scope = 'Today', children } = this.props
    return (
      <div className="tile-boundary" ref={this.box}>
        {this.state.failed ? (
          <section className="tile-error" role="alert" aria-label={title}>
            <span className="tile-error__icon" aria-hidden="true">
              <Icon name="error" size={24} />
            </span>
            <p className="tile-error__text">
              <strong>{tileErrorStrings.title(title)}</strong>
              {tileErrorStrings.rest(scope)}
            </p>
            <Button variant="secondary" size="sm" onClick={this.retry}>
              {overlayStrings.tryAgain}
            </Button>
          </section>
        ) : (
          children
        )}
      </div>
    )
  }
}

const changed = (a: ReadonlyArray<unknown> = [], b: ReadonlyArray<unknown> = []) => a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))

export function TileErrorBoundary(props: TileErrorBoundaryProps) {
  const client = useQueryClient()
  return <TileBoundary {...props} client={client} />
}
