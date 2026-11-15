// B9-41 (SSP-07, SSP-15): what the Scan screen hands the new-Product sheet beyond the code: the decoded weight and item code of a weighed
// code (its header line), and the weighed-goods hint of an in-store code at a Shop with no Weight Barcode Rule (the Admin's way in is the
// Shop's page at its Weight Barcode Rules, #weight-barcode-rules). A price-valued weighed code asks its weight in the sheet, so it has no `weighed`.
// The User's role comes from `probe` (an AdminRoleProbe the screen mounts), so the User is asked for only while the hint shows.
import { createElement, useCallback, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { WEIGHT_RULES_ANCHOR } from '../../shops/hooks/useHashSection'
import { AdminRoleProbe } from '../components/AdminRoleProbe'
import type { NewProductSheetProps } from '../components/NewProductSheet'
import type { FlowSheet } from './useScanFlow'

export type NewProductHints = Pick<NewProductSheetProps, 'weighed' | 'weightCodeHint'>

export function useNewProductHints(sheet: FlowSheet | null, shop: { id: number } | null): { props: NewProductHints; probe: ReactNode } {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(false)
  const onAdmin = useCallback((next: boolean) => setAdmin(next), [])
  if (sheet?.kind !== 'unknown') return { props: {}, probe: null }
  const props: NewProductHints = {}
  if (sheet.target.mode === 'weighed') props.weighed = { grams: sheet.target.weightGrams, itemCode: sheet.target.itemCode }
  if (!sheet.weightCodeHint || !shop) return { props, probe: null }
  const shopId = shop.id
  props.weightCodeHint = { admin, onSetUp: () => void navigate(`/settings/shops/${shopId}#${WEIGHT_RULES_ANCHOR}`) }
  return { props, probe: createElement(AdminRoleProbe, { onAdmin }) }
}
