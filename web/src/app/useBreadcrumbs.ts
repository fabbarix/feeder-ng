import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import type { Crumb } from '../ui/Breadcrumbs'
import { crumbsFor } from './breadcrumbs'

/** The Breadcrumbs trail of the current route (`entityName` fills an entity crumb once it is known). */
export function useBreadcrumbs(entityName?: string): Crumb[] {
  const { pathname } = useLocation()
  return useMemo(() => crumbsFor(pathname, entityName), [pathname, entityName])
}
