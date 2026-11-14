// b8-shop: the Shop header chips show their short values below 420 px (docs/dev/design/b8-shop.md 1). Without matchMedia
// (jsdom) the chips read as wide, as useMediaQuery does.
import { useMediaQuery } from '../../../ui/lib/useMediaQuery'

/** True below 420 px: the header chips keep their icons and show short values. */
export function useNarrowChips(): boolean {
  return !useMediaQuery('(min-width: 420px)')
}
