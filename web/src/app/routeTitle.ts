// B9-49 (A11Y-01): the provisional document title the shell sets from the route table before a page's own h1 mounts (loading, error):
// "<section's nav label> · Feeder", or "Feeder" for an unknown route. Plain TypeScript, no React.
import { documentTitle } from '../ui/lib/useDocumentTitle'
import { MENU_NAV, PRIMARY_NAV } from './nav'
import { currentNavOf } from './navCurrent'

const OWN_TITLES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/cook(\/|$)/, 'Cook Mode'],
  [/^\/scan\/receipt(\/|$)/, 'Receipt'],
]

const pathOf = (pathname: string): string => {
  const path = pathname.replace(/[?#].*$/, '')
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path || '/'
}

export function routeTitle(pathname: string): string {
  const path = pathOf(pathname)
  for (const [re, label] of OWN_TITLES) if (re.test(path)) return documentTitle([label])
  const menu = MENU_NAV.find((item) => path === item.path || path.startsWith(`${item.path}/`))
  if (menu) return documentTitle([menu.label])
  const nav = currentNavOf(PRIMARY_NAV, path)
  return documentTitle([nav?.label])
}
