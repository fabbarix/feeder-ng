// Feature discovery. Each web/src/features/<feature>/index.ts exports routes and
// optional navItems; nothing in the shell needs editing to add a feature.
import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ComingSoon } from './ComingSoon'
import { NotFound } from './NotFound'
import { MENU_NAV, PRIMARY_NAV, sortByOrder, type NavItem } from './nav'

export interface FeatureModule {
  routes: RouteObject[]
  navItems?: NavItem[]
}

export interface CollectedFeatures {
  routes: RouteObject[]
  navItems: NavItem[]
}

/** Merges feature modules. Modules are read in key order, so the result does not depend on object order. */
export function collectFeatures(modules: Record<string, FeatureModule>): CollectedFeatures {
  const routes: RouteObject[] = []
  const navItems: NavItem[] = []
  const owners = new Map<string, string>()
  for (const key of Object.keys(modules).sort()) {
    const mod = modules[key]!
    for (const route of mod.routes) {
      const path = route.path ?? ''
      const owner = owners.get(path)
      if (owner !== undefined) {
        throw new Error(`Duplicate route ${path}: declared by ${owner} and ${key}`)
      }
      owners.set(path, key)
      routes.push(route)
    }
    navItems.push(...(mod.navItems ?? []))
  }
  return { routes, navItems: sortByOrder(navItems) }
}

/** Shell routes: every feature route, plus a "coming soon" page for each core destination no feature provides. */
export function buildRoutes(modules: Record<string, FeatureModule>): RouteObject[] {
  const { routes } = collectFeatures(modules)
  const provided = new Set(routes.map((r) => r.path))
  const placeholders: RouteObject[] = [...PRIMARY_NAV, ...MENU_NAV]
    .filter((dest) => !provided.has(dest.path))
    .map((dest) => ({ path: dest.path, element: createElement(ComingSoon, { title: dest.label }) }))
  // Catch-all last: any path no route claims shows Page not found inside the shell.
  return [...routes, ...placeholders, { path: '*', element: createElement(NotFound) }]
}

/** The discovered feature modules, keyed by file path. */
export function discoverFeatures(): Record<string, FeatureModule> {
  return import.meta.glob('../features/*/index.ts', { eager: true }) as Record<string, FeatureModule>
}

export function loadFeatures(): CollectedFeatures {
  return collectFeatures(discoverFeatures())
}
