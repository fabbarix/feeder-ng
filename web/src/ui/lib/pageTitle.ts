// B9-19 (A11Y-01): the document title's context part, taken from the breadcrumb trail.
import type { Crumb } from '../Breadcrumbs'

/** The label of the crumb just before the current page (`crumbs.at(-2)`), or undefined without one. */
export function parentCrumb(crumbs: Crumb[] | undefined): string | undefined {
  if (!crumbs || crumbs.length < 2) return undefined
  return crumbs.at(-2)?.label
}
