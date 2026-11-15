// b8-polish, B9-09: the one named width exception in the Shop. On a narrow screen a Supply row's Restock reason is compact ("400 ml/1 l")
// below 420 px, so every supported phone (375 to 414 px) keeps the compact text it had before the em table. The threshold is written in em
// (26.25 em at 16 px, which follows the browser text size) and is not one of the ui/lib/breakpoints bands. B9-15 moved the header chips
// off this query (they fit by their own row: the chip Select's shortLabel); only the rows read it now.

/** Below 420 px at a 16 px text size: a Restock reason shows its compact form. */
export const COMPACT_ROWS_QUERY = '(width < 26.25em)'
