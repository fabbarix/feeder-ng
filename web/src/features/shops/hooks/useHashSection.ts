// batch w5a (B9-41, SSP-15): a link to a section of a page (`/settings/shops/3#weight-barcode-rules`) scrolls that section into view once
// it is on the page, once per hash. Scan's weighed-goods hint sends an Admin here with "Set up the rule".
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { prefersReducedMotion } from '../../../lib/motion'

/** The id of the Shop page's Weight Barcode Rules section. */
export const WEIGHT_RULES_ANCHOR = 'weight-barcode-rules'

/** Scrolls the element named by the location hash into view after the render that first shows it; does nothing without a hash. */
export function useHashSection(): void {
  const { hash } = useLocation()
  const handled = useRef('')
  useEffect(() => {
    if (!hash || hash.length < 2 || handled.current === hash) return
    const element = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (!element) return
    handled.current = hash
    element.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  })
}
