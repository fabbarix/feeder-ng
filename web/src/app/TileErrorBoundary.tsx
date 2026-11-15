// B9-20 (RES-09): STUB for the tests; the developer builds it.
import { Component, type ReactNode } from 'react'

export interface TileErrorBoundaryProps {
  title: string
  /** the tile's query keys, reset on Try again */
  queryKeys?: ReadonlyArray<readonly unknown[]>
  /** the page's name for "The rest of {scope} is fine." Default "Today". */
  scope?: string
  resetKeys?: ReadonlyArray<unknown>
  children: ReactNode
}
export class TileErrorBoundary extends Component<TileErrorBoundaryProps> {
  render() {
    return this.props.children
  }
}
