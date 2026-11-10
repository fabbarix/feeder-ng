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
import { buildRoutes, collectFeatures, discoverFeatures } from './app/features'
import { AppProviders } from './app/providers'
import { RouteErrorBoundary } from './app/PageErrorBoundary'

const modules = discoverFeatures()
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppRoot navItems={collectFeatures(modules).navItems} />,
    errorElement: <RouteErrorBoundary />,
    children: buildRoutes(modules),
  },
  // Dev-only catalogue of the shared primitives; stripped from production builds.
  ...(import.meta.env.DEV
    ? [{ path: '/_gallery', lazy: async () => ({ Component: (await import('./ui/Gallery')).Gallery }) }]
    : []),
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
