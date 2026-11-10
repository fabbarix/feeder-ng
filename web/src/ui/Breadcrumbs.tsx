// TYPE-ONLY STUB (R11a test-first). The developer implements this; see docs/dev/design/r11a-settings-shell.md.
export interface Crumb {
  label: string
  /** Absent on the current page (the last crumb). */
  to?: string
}
export interface BreadcrumbsProps {
  items: Crumb[]
}
export function Breadcrumbs(_props: BreadcrumbsProps): null {
  return null
}
