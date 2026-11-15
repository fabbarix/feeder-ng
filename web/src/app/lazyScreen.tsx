// B9-59 (RES-04, route splitting): a route element whose screen is loaded on demand. A feature's index.ts declares
//   { path: '/plan', element: lazyScreen(() => import('./screens/PlanScreen'), 'PlanScreen') }
// and the screen's code goes to its own chunk. While it loads, the page shows its own loading state (RouteLoading) inside
// the shell; a failed load throws to the shell's PageErrorBoundary (the error state, whose Try again imports again).
// The chunk itself (load once, keep, retry) is app/routeChunks.ts.
import { createElement, Suspense, use, type ComponentType, type ReactElement } from 'react'
import { matchRoutes, type RouteObject } from 'react-router-dom'
import { RouteLoading } from './RouteLoading'
import { routeChunk, type RouteChunk } from './routeChunks'

type Screen = ComponentType<object>
export type ScreenChunk = RouteChunk<Screen>

interface LazyScreenProps {
  chunk: ScreenChunk
}

/** One chunk per (importer, export name): two routes of one screen (Cook Mode, the Recipe editor) share it. */
const chunks = new WeakMap<object, Map<string, ScreenChunk>>()

function chunkFor<M>(importer: () => Promise<M>, name: string): ScreenChunk {
  let byName = chunks.get(importer)
  if (!byName) chunks.set(importer, (byName = new Map()))
  let chunk = byName.get(name)
  if (!chunk) {
    chunk = routeChunk(async () => {
      const mod = (await importer()) as Record<string, unknown>
      const screen = mod[name]
      if (typeof screen !== 'function' && (typeof screen !== 'object' || screen === null)) {
        throw new Error(`lazyScreen: the module has no screen export "${name}"`)
      }
      return screen as Screen
    })
    byName.set(name, chunk)
  }
  return chunk
}

function Loaded({ chunk }: LazyScreenProps) {
  const LoadedScreen = chunk.peek() ?? use(chunk.load('render'))
  return createElement(LoadedScreen)
}

// The tree is the same whether the chunk is loaded or not, so a re-render never remounts the screen. A loaded chunk does not
// suspend, so it renders at once with no fallback, not even for a frame.
function LazyScreen({ chunk }: LazyScreenProps) {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Loaded chunk={chunk} />
    </Suspense>
  )
}

export function lazyScreen<M>(importer: () => Promise<M>, name: keyof M & string): ReactElement {
  return createElement(LazyScreen, { chunk: chunkFor(importer, name) })
}

/** The chunk behind a route element made by lazyScreen, or undefined for any other element. */
export function chunkOfElement(element: unknown): ScreenChunk | undefined {
  if (typeof element !== 'object' || element === null) return undefined
  const { type, props } = element as { type?: unknown; props?: Partial<LazyScreenProps> }
  return type === LazyScreen ? props?.chunk : undefined
}

/** For prefetching: the chunk of the route a concrete path opens (the deepest match), or undefined. */
export function chunkResolver(routes: RouteObject[]): (path: string) => ScreenChunk | undefined {
  return (path) => {
    const matches = matchRoutes(routes, path)
    return chunkOfElement(matches?.at(-1)?.route.element)
  }
}
