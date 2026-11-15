// B9-59 (RES-04, route splitting): the routes load their screens on demand. Every lazy route in the real table resolves to
// a screen; Today and the shell stay in the entry; while a chunk loads the page shows its own loading state inside the
// shell; a chunk that fails shows the page's error state, and Try again really imports again.
import { bottomBarNav, queryBottomBar } from '../test/shellNav'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { isValidElement, type ComponentType } from 'react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { buildRoutes, discoverFeatures, type FeatureModule } from './features'
import { chunkOfElement, chunkResolver, lazyScreen } from './lazyScreen'
import { retryFailedChunks } from './routeChunks'
import { resetStaleBuild } from './staleChunk'

vi.mock('./ShellStatus', () => ({ ShellStatus: () => <div data-testid="shell-status" /> }))
// int1: AppShell mounts the shell timers since B9-25 (they read the timers through react-query): mocked, as every AppShell test does.
vi.mock('./ShellTimers', () => ({ ShellTimers: () => null }))

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => {
  vi.restoreAllMocks()
  retryFailedChunks()
  resetStaleBuild()
})

const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// A screen that suspends is rendered, and its import settled, inside an awaited act: React (19) re-renders a suspended tree
// in a test only from there. Tests that render the whole router with lazy routes do the same.
async function shellAt(path: string, routes: RouteObject[]) {
  const router = createMemoryRouter(
    [{ path: '/', element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} />, children: routes }],
    { initialEntries: [path] },
  )
  await act(async () => {
    render(<RouterProvider router={router} />)
  })
  return router
}

/** Runs `step` (a click, a navigation, an import settling) and lets React finish, inside one awaited act. */
const settle = (step: () => unknown = () => {}) =>
  act(async () => {
    await step()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

const flat = (routes: RouteObject[]): RouteObject[] => routes.flatMap((r) => [r, ...flat(r.children ?? [])])
const realRoutes = () => flat(buildRoutes(discoverFeatures()))

describe('the real route table', () => {
  // The routes on demand: everything that the first paint of Today does not need.
  const LAZY = [
    '/plan',
    '/settings/planning',
    '/plan/couldnt-plan/excluded',
    '/pantry',
    '/settings/storage-places',
    '/shop',
    '/scan',
    '/scan/receipt',
    '/scan/receipt/review',
    '/recipes',
    '/recipes/new',
    '/recipes/:id',
    '/recipes/:id/edit',
    '/recipes/import',
    '/recipes/export',
    '/cook/meal/:date/:slotId',
    '/cook/meal/:date/:slotId/:courseId',
    '/cook/recipe/:id',
    '/cook/reheat/:date/:slotId/:courseId',
    '/board',
    '/ingredients',
    '/ingredients/:id',
    '/supplies',
    '/supplies/:id',
    '/products',
    '/products/:id',
    '/settings',
    '/settings/household',
    '/settings/members',
    '/settings/meal-slots',
    '/settings/courses',
    '/settings/allowlist',
    '/settings/preferences',
    '/settings/recipe-assistant',
    '/settings/notifications',
    '/settings/shops',
    '/settings/shops/:id',
    '/settings/tags',
    '/settings/access-requests',
  ]

  it.each(LAZY)('%s loads its screen on demand', (path) => {
    const route = realRoutes().find((r) => r.path === path)
    expect(route, path).toBeDefined()
    expect(chunkOfElement(route!.element), path).toBeDefined()
  })

  it('Today, the redirects and Page not found stay in the entry', () => {
    for (const path of ['/', '/stock', '*', '/sign-in']) {
      const route = realRoutes().find((r) => r.path === path)
      expect(route, path).toBeDefined()
      expect(chunkOfElement(route!.element), path).toBeUndefined()
    }
  })

  it('every lazy route in the table resolves to a screen component', async () => {
    const lazy = realRoutes().filter((r) => chunkOfElement(r.element))
    expect(lazy.length).toBeGreaterThanOrEqual(LAZY.length)
    for (const route of lazy) {
      const Screen = await chunkOfElement(route.element)!.load()
      expect(typeof Screen === 'function' || (typeof Screen === 'object' && Screen !== null), route.path).toBe(true)
    }
  }, 60_000)

  it('chunkResolver finds the chunk of a concrete path, and none for Today or an unknown one', () => {
    const resolve = chunkResolver(buildRoutes(discoverFeatures()))
    expect(resolve('/plan')).toBeDefined()
    expect(resolve('/recipes/12/edit')).toBe(chunkOfElement(realRoutes().find((r) => r.path === '/recipes/:id/edit')!.element))
    expect(resolve('/')).toBeUndefined()
    expect(resolve('/no/such/page')).toBeUndefined()
  })
})

describe('lazyScreen', () => {
  it('is a route element, and two routes of the same screen share one chunk', () => {
    const importer = async () => ({ Cook: () => <p>Cook</p> })
    const a = lazyScreen(importer, 'Cook')
    const b = lazyScreen(importer, 'Cook')
    expect(isValidElement(a)).toBe(true)
    expect(chunkOfElement(a)).toBe(chunkOfElement(b))
  })

  it('while the chunk loads, the page shows its own loading state inside the shell: the title, a busy skeleton, the bars', async () => {
    const d = deferred<{ PlanScreen: ComponentType }>()
    const mods: Record<string, FeatureModule> = { plan: { routes: [{ path: '/plan', element: lazyScreen(() => d.promise, 'PlanScreen') }] } }
    await shellAt('/plan', buildRoutes(mods))
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument()
    expect(main.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(bottomBarNav()).toBeInTheDocument()
    expect(document.title).toMatch(/^Plan · Feeder/)
    await settle(() => d.resolve({ PlanScreen: () => <h1>The week</h1> }))
    expect(within(main).getByRole('heading', { name: 'The week' })).toBeInTheDocument()
    expect(main.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('a detail route shows its trail and the GLOSSARY fallback title while it loads', async () => {
    const mods: Record<string, FeatureModule> = {
      recipes: { routes: [{ path: '/recipes/:id', element: lazyScreen(() => new Promise<{ R: ComponentType }>(() => {}), 'R') }] },
    }
    await shellAt('/recipes/7', buildRoutes(mods))
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { level: 1, name: 'Recipe' })).toBeInTheDocument()
    expect(within(main).getByRole('link', { name: 'Recipes' })).toHaveAttribute('href', '/recipes')
    expect(document.title).toBe('Recipe · Recipes · Feeder')
  })

  it('a chromeless route (Cook Mode) shows its own minimal frame: no bars, a busy skeleton in the full-screen main', async () => {
    const mods: Record<string, FeatureModule> = {
      cook: { routes: [{ path: '/cook/recipe/:id', element: lazyScreen(() => new Promise<{ C: ComponentType }>(() => {}), 'C') }] },
    }
    await shellAt('/cook/recipe/3', buildRoutes(mods))
    const main = screen.getByRole('main')
    expect(main.className).toContain('app-main--full')
    expect(main.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(queryBottomBar()).toBeNull()
  })

  it('a chunk that fails to load shows the error state with Try again, and Try again really imports again', async () => {
    const importer = vi
      .fn<() => Promise<{ ShopScreen: ComponentType }>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: /assets/ShoppingScreen-a.js'))
      .mockResolvedValue({ ShopScreen: () => <h1>Shopping List</h1> })
    const mods: Record<string, FeatureModule> = { shop: { routes: [{ path: '/shop', element: lazyScreen(importer, 'ShopScreen') }] } }
    await shellAt('/shop', buildRoutes(mods))
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(bottomBarNav()).toBeInTheDocument() // the bars stay usable
    expect(importer).toHaveBeenCalledTimes(1) // no import storm while the error shows
    await settle(() => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(screen.getByRole('heading', { name: 'Shopping List' })).toBeInTheDocument()
    expect(importer).toHaveBeenCalledTimes(2)
  })

  it('a chunk that failed recovers when the User goes elsewhere and comes back', async () => {
    const importer = vi
      .fn<() => Promise<{ S: ComponentType }>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ S: () => <h1>Pantry page</h1> })
    const mods: Record<string, FeatureModule> = {
      stock: { routes: [{ path: '/pantry', element: lazyScreen(importer, 'S') }] },
      today: { routes: [{ path: '/', element: <h1>Today page</h1> }] },
    }
    const router = await shellAt('/pantry', buildRoutes(mods))
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    await settle(() => router.navigate('/'))
    expect(screen.getByRole('heading', { name: 'Today page' })).toBeInTheDocument()
    await settle(() => router.navigate('/pantry'))
    // A new visit is a new attempt: the import runs again, with no Try again needed.
    expect(screen.getByRole('heading', { name: 'Pantry page' })).toBeInTheDocument()
    expect(importer).toHaveBeenCalledTimes(2)
  })

  it('a loaded chunk renders at once on the next visit, with no loading state in between', async () => {
    const importer = async () => ({ P: () => <h1>Plan page</h1> })
    const element = lazyScreen(importer, 'P')
    await chunkOfElement(element)!.load()
    await shellAt('/plan', buildRoutes({ plan: { routes: [{ path: '/plan', element }] } }))
    expect(screen.getByRole('heading', { name: 'Plan page' })).toBeInTheDocument()
  })

  it('navigating from one lazy route to another still loading shows the new route\'s loading state at once, not the old page', async () => {
    const d = deferred<{ S: ComponentType }>()
    const mods: Record<string, FeatureModule> = {
      plan: { routes: [{ path: '/plan', element: lazyScreen(async () => ({ P: () => <h1>The week</h1> }), 'P') }] },
      stock: { routes: [{ path: '/pantry', element: lazyScreen(() => d.promise, 'S') }] },
    }
    await shellAt('/plan', buildRoutes(mods))
    expect(screen.getByRole('heading', { name: 'The week' })).toBeInTheDocument()
    await settle(() => fireEvent.click(within(bottomBarNav()).getByRole('link', { name: 'Pantry' })))
    expect(screen.queryByRole('heading', { name: 'The week' })).toBeNull()
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'Pantry' })).toBeInTheDocument()
    expect(screen.getByRole('main').querySelector('[aria-busy="true"]')).not.toBeNull()
    await settle(() => d.resolve({ S: () => <h1>Stock list</h1> }))
    expect(screen.getByRole('heading', { name: 'Stock list' })).toBeInTheDocument()
  })

  it('navigating from Today to a route that is still loading shows that route\'s loading state at once, not the old page', async () => {
    const d = deferred<{ PlanScreen: ComponentType }>()
    const mods: Record<string, FeatureModule> = {
      today: { routes: [{ path: '/', element: <h1>Today page</h1> }] },
      plan: { routes: [{ path: '/plan', element: lazyScreen(() => d.promise, 'PlanScreen') }] },
    }
    await shellAt('/', buildRoutes(mods))
    await settle(() => fireEvent.click(within(bottomBarNav()).getByRole('link', { name: 'Plan' })))
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Today page' })).toBeNull()
    await settle(() => d.resolve({ PlanScreen: () => <h1>The week</h1> }))
    expect(screen.getByRole('heading', { name: 'The week' })).toBeInTheDocument()
  })
})
