// B9-44 (TB-11, B9-59): the Lot sheet host as Today imports it: loaded on demand the first time a Lot is opened, so the Lot sheet and its
// edit form stay out of the entry chunk Today is in. Renders nothing for no Lot (and nothing while its code loads).
import { createElement, lazy, Suspense, type ReactElement } from 'react'
import type { LotSheetHostProps } from './LotSheetHost'

const Host = lazy(() => import('./LotSheetHost').then((m) => ({ default: m.LotSheetHost })))

export function LotSheetHost(props: LotSheetHostProps): ReactElement | null {
  if (props.lotId === null) return null
  return createElement(Suspense, { fallback: null }, createElement(Host, props))
}
