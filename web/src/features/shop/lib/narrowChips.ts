// B9-09 (DS-09): the one named width exception in the Shop. The header chips (RangePicker, the Shop picker) and the compact Restock
// reason shorten below 420 px, so every supported phone (375 to 414 px) keeps the compact text it had before the em table. The
// threshold is written in em (26.25 em at 16 px, which follows the browser text size) and is not one of the ui/lib/breakpoints bands:
// it stays here until B9-15's container-driven chip fitting (useFittingChips) replaces it.

/** Below 420 px at a 16 px text size: the header chips show short values and a Restock reason its compact form. */
export const NARROW_CHIPS_QUERY = '(width < 26.25em)'
