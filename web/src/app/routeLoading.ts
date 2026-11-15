// B9-59 (RES-04): what a route shows while its code loads, in the shape of the page's own loading state (B9-20): its
// title and trail, then the skeleton the screen itself shows while its data loads. Plain TypeScript, no React.
import type { Crumb } from '../ui/Breadcrumbs'
import { crumbsFor } from './breadcrumbs'
import { isChromeless } from './chromeless'
import { PRIMARY_NAV } from './nav'

/** The skeleton under the header: the screens' own (Plan, Recipes, a Recipe), rows of a list, or two tiles. */
export type LoadingBody = 'plan' | 'recipes' | 'recipe' | 'list' | 'tiles'

export type RouteLoadingView =
  /** Cook Mode, the Kitchen board, the receipt screens: no bars, so a minimal frame of their own. */
  | { frame: 'chromeless' }
  | { frame: 'shell'; title?: string; crumbs: Crumb[]; subtitle?: string; body: LoadingBody }

/** First match wins; a path no entry claims gets rows of a list (the Settings pages, the catalogue). */
const BODIES: ReadonlyArray<[RegExp, LoadingBody]> = [
  [/^\/plan$/, 'plan'],
  [/^\/recipes$/, 'recipes'],
  [/^\/recipes\/(?!new$|import$|export$)[^/]+$/, 'recipe'],
  [/^\/(shop|scan)$/, 'tiles'],
]

/** Scan shows no header while its Shops load (the header names the Shop it picks), so it shows none while its code loads. */
const HEADLESS = /^\/scan$/

const clean = (pathname: string) => (pathname.split(/[?#]/)[0] ?? '/').replace(/(.)\/+$/, '$1')

export function routeLoadingFor(pathname: string): RouteLoadingView {
  const path = clean(pathname)
  if (isChromeless(path)) return { frame: 'chromeless' }
  const body = BODIES.find(([pattern]) => pattern.test(path))?.[1] ?? 'list'
  const trail = crumbsFor(path)
  const title = trail.at(-1)?.label ?? PRIMARY_NAV.find((item) => item.path === path)?.label
  // Plan keeps its subtitle row from the first frame (B9-20), so the week range does not push the grid down.
  const subtitle = body === 'plan' ? '\u00a0' : undefined
  if (HEADLESS.test(path)) return { frame: 'shell', crumbs: [], body }
  return { frame: 'shell', title, crumbs: trail.length > 1 ? trail : [], subtitle, body }
}
