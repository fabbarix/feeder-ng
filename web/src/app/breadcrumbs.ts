// TYPE-ONLY STUB (R11a test-first). The developer implements the table and crumbsFor; see docs/dev/design/r11a-settings-shell.md.
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
export const ROUTE_CRUMBS: RouteCrumb[] = []
export function crumbsFor(_pathname: string, _entityName?: string): Crumb[] {
  return []
}
