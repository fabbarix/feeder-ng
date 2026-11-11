// The ONE place that says which routes have a hierarchy and what their crumbs are called. Plain TypeScript, no React.
import { settingsStrings } from '../features/settings/strings'
import { breadcrumbStrings as S } from './breadcrumbStrings'
import type { Crumb } from '../ui/Breadcrumbs'

export interface RouteCrumb {
  /** The route path pattern, as the feature declares it ("/recipes/:id/edit"). */
  path: string
  /** The crumb label; for an entity route it is the GLOSSARY fallback ("Recipe") used until the entity's name is known. */
  label: string
  /** The path pattern of the parent route (a root such as "/settings" or "/recipes" is a parent too). */
  parent?: string
  /** True when the label is the entity's own name (passed to crumbsFor / useBreadcrumbs). */
  entity?: boolean
}

/** Roots have no trail of their own; they only appear as the first crumb of their children. */
const ROOTS: Record<string, string> = {
  '/settings': S.roots.settings,
  '/recipes': S.roots.recipes,
  '/ingredients': S.roots.ingredients,
  '/products': S.roots.products,
}

const sections = settingsStrings.index.sections

export const ROUTE_CRUMBS: RouteCrumb[] = [
  { path: '/settings/household', label: sections.household.title, parent: '/settings' },
  { path: '/settings/members', label: sections.members.title, parent: '/settings' },
  { path: '/settings/meal-slots', label: sections.mealSlots.title, parent: '/settings' },
  { path: '/settings/courses', label: sections.courses.title, parent: '/settings' },
  { path: '/settings/planning', label: sections.planningRules.title, parent: '/settings' },
  { path: '/settings/shops', label: sections.shops.title, parent: '/settings' },
  { path: '/settings/storage-places', label: sections.storagePlaces.title, parent: '/settings' },
  { path: '/settings/preferences', label: sections.preferences.title, parent: '/settings' },
  { path: '/settings/access-requests', label: sections.accessRequests.title, parent: '/settings' },
  { path: '/settings/notifications', label: sections.notifications.title, parent: '/settings' },
  { path: '/settings/allowlist', label: sections.allowlist.title, parent: '/settings' },
  { path: '/settings/recipe-assistant', label: sections.recipeAssistant.title, parent: '/settings' },
  { path: '/settings/shops/:id', label: S.entity.shop, parent: '/settings/shops', entity: true },
  { path: '/recipes/new', label: S.newRecipe, parent: '/recipes' },
  { path: '/recipes/import', label: S.importRecipes, parent: '/recipes' },
  { path: '/recipes/export', label: S.exportRecipes, parent: '/recipes' },
  { path: '/recipes/:id', label: S.entity.recipe, parent: '/recipes', entity: true },
  { path: '/recipes/:id/edit', label: S.edit, parent: '/recipes/:id' },
  { path: '/ingredients/:id', label: S.entity.ingredient, parent: '/ingredients', entity: true },
  { path: '/products/:id', label: S.entity.product, parent: '/products', entity: true },
]

const segments = (path: string) => path.split('/').filter(Boolean)

/** The `:id` values when `pattern` matches `actual`, else null. */
function match(pattern: string, actual: string[]): Record<string, string> | null {
  const parts = segments(pattern)
  if (parts.length !== actual.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (part.startsWith(':')) params[part.slice(1)] = actual[i]!
    else if (part !== actual[i]) return null
  }
  return params
}

/** Static segments beat `:id`: the pattern with the fewest params wins. */
function paramCount(pattern: string): number {
  return segments(pattern).filter((s) => s.startsWith(':')).length
}

const fill = (pattern: string, params: Record<string, string>) =>
  '/' + segments(pattern).map((s) => (s.startsWith(':') ? (params[s.slice(1)] ?? s) : s)).join('/')

/** The trail for a location; `[]` for roots and unknown paths. The last crumb has no `to`. */
export function crumbsFor(pathname: string, entityName?: string): Crumb[] {
  const actual = segments(pathname.replace(/[?#].*$/, ''))
  let best: { route: RouteCrumb; params: Record<string, string> } | null = null
  for (const route of ROUTE_CRUMBS) {
    const params = match(route.path, actual)
    if (params && (!best || paramCount(route.path) < paramCount(best.route.path))) best = { route, params }
  }
  if (!best) return []
  const { params } = best
  const trail: Crumb[] = []
  let route: RouteCrumb | undefined = best.route
  while (route) {
    const label = route.entity && entityName ? entityName : route.label
    trail.unshift({ label, to: fill(route.path, params) })
    const parent: string | undefined = route.parent
    if (!parent) break
    const next: RouteCrumb | undefined = ROUTE_CRUMBS.find((r) => r.path === parent)
    if (!next) {
      const rootLabel = ROOTS[parent]
      if (rootLabel) trail.unshift({ label: rootLabel, to: parent })
      break
    }
    route = next
  }
  // The edit page's parent crumb carries the Recipe name (entity), the current page has no link.
  const last = trail[trail.length - 1]!
  delete last.to
  return trail
}
