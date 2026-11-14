// b8-shop: the Shop header chips show their short values below 420 px (docs/dev/design/b8-shop.md 1). B9-09: the query is the Shop's
// named exception in lib/narrowChips (26.25 em), until B9-15's container-driven chip fitting replaces it. Without matchMedia (jsdom)
// the chips read as wide, as useMediaQuery does.
import { useMediaQuery } from '../../../ui/lib/useMediaQuery'
import { NARROW_CHIPS_QUERY } from '../lib/narrowChips'

/** True below 26.25 em (420 px): the header chips keep their icons and show short values. */
export function useNarrowChips(): boolean {
  const narrow = useMediaQuery(NARROW_CHIPS_QUERY)
  // useMediaQuery reads true without matchMedia (the desktop presentation); here that must mean wide, not narrow.
  return typeof globalThis.matchMedia === 'function' && narrow
}
