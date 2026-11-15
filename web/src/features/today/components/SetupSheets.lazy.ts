// B9-53 (TB-06): the first-run sheets as Today imports them: loaded the first time a step opens one, so the Member form, the quick start and
// the pickers stay out of the entry chunk Today is in. Renders nothing when no sheet is open (and nothing while its code loads).
import { createElement, lazy, Suspense, type ReactElement } from 'react'
import type { SetupSheetsProps } from './SetupSheets'

const Sheets = lazy(() => import('./SetupSheets').then((m) => ({ default: m.SetupSheets })))

export function SetupSheets(props: Omit<SetupSheetsProps, 'sheet'> & { sheet: SetupSheetsProps['sheet'] | null }): ReactElement | null {
  if (props.sheet === null) return null
  return createElement(Suspense, { fallback: null }, createElement(Sheets, { ...props, sheet: props.sheet }))
}
