// b8-polish: Supply rows show the compact Restock reason below 420 px (lib/compactRows, the Shop's one named width exception). Without
// matchMedia (jsdom) the rows read as wide, as useMediaQuery does.
import { useMediaQuery } from '../../../ui/lib/useMediaQuery'
import { COMPACT_ROWS_QUERY } from '../lib/compactRows'

/** True below 26.25 em (420 px): a Restock reason shows its compact form. */
export function useCompactRows(): boolean {
  const narrow = useMediaQuery(COMPACT_ROWS_QUERY)
  // useMediaQuery reads true without matchMedia (the desktop presentation); here that must mean wide, not narrow.
  return typeof globalThis.matchMedia === 'function' && narrow
}
