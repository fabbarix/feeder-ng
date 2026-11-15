// B9-20 (RES-09): the query roots a crashed page resets on Try again, so cached bad data cannot crash it again. Plain
// TypeScript. Never the signed-in User (['me']): a crashed page must not sign anyone out.
import type { QueryKey } from '@tanstack/react-query'

const BY_ROOT: Record<string, QueryKey[]> = {
  '': [['today'], ['plan'], ['leftovers']],
  plan: [['plan'], ['leftovers']],
  recipes: [['recipes'], ['tags'], ['courses']],
  pantry: [['stock']],
  stock: [['stock']],
  shop: [['shopping']],
  shops: [['shops']],
  products: [['products']],
  supplies: [['products'], ['stock']],
  ingredients: [['ingredients']],
  cook: [['cook']],
  board: [['board'], ['plan']],
  scan: [['scan']],
  settings: [['household'], ['members'], ['meal-slots'], ['slot-rules'], ['variety-rules'], ['courses'], ['tags']],
}

export function routeQueryKeys(pathname: string): QueryKey[] {
  const root = pathname.split('/').filter(Boolean)[0] ?? ''
  return BY_ROOT[root] ?? []
}
