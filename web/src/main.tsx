import '@fontsource/figtree/400.css'
import '@fontsource/figtree/500.css'
import '@fontsource/figtree/600.css'
import '@fontsource/figtree/700.css'
import '@fontsource/figtree/800.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppRoot } from './app/AppRoot'
import { AppUpdate } from './app/AppUpdate'
import { buildRoutes, collectFeatures, discoverFeatures } from './app/features'
import { chunkResolver } from './app/lazyScreen'
import { PRIMARY_NAV } from './app/nav'
import { createPrefetcher } from './app/prefetch'
import { AppProviders } from './app/providers'
import { RouteErrorBoundary } from './app/PageErrorBoundary'
import { announceNewVersion, registerServiceWorker } from './app/serviceWorker'
import { browserStaleCheckEnv, watchChunkFailures } from './app/staleChunk'

const modules = discoverFeatures()
const { navItems, statusHooks } = collectFeatures(modules)
const routes = buildRoutes(modules)
// B9-59 (RES-04): the routes load their code on demand. The shell's nav links prefetch theirs when pressed or focused, and
// a route chunk that fails because a new version removed it leads to the "new version, Reload" prompt.
const prefetcher = createPrefetcher(chunkResolver(routes))
watchChunkFailures(browserStaleCheckEnv(() => announceNewVersion()))
const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <>
        <AppRoot navItems={navItems} statusHooks={statusHooks} onNavIntent={prefetcher.prefetch} />
        <AppUpdate statusHooks={statusHooks} />
      </>
    ),
    errorElement: <RouteErrorBoundary />,
    children: routes,
  },
  // Dev-only catalogue of the shared primitives; stripped from production builds.
  ...(import.meta.env.DEV
    ? [
        { path: '/_gallery', lazy: async () => ({ Component: (await import('./ui/Gallery')).Gallery }) },
        // Dev-only: the photo editor on a generated picture, for scripts/check-shell-layout.mjs (rule 15).
        { path: '/_editor-fixture', lazy: async () => ({ Component: (await import('./dev/EditorFixture')).EditorFixture }) },
      ]
    : []),
])

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)

// After the first paint, once the page has loaded and the browser is idle: the bottom-bar destinations' code, one at a time
// (Today's is in the entry). Never on a data-saver connection (app/prefetch.ts).
const prefetchNav = () => prefetcher.prefetchOnIdle(PRIMARY_NAV.map((item) => item.path))
if (document.readyState === 'complete') prefetchNav()
else window.addEventListener('load', prefetchNav, { once: true })
