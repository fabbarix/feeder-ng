// The Household's money as the receipt screens say it ("€3.49"): its currency, English number format.
import { useCallback } from 'react'
import { formatPriceMinor } from '../../../ui/lib/moneyInput'
import { useCurrency } from '../../products/hooks/useCurrency'
import type { Money } from '../lib/reviewCopy'

export function useMoney(): Money {
  const currency = useCurrency()
  return useCallback((cents: number) => formatPriceMinor(cents, currency, 'en'), [currency])
}
