export interface CostTileProps {
  /** sum of the priced, unticked Lines */
  costCents: number
  /** Lines with no Price ("—") */
  unpriced: number
  currency: string
}

/**
 * The estimated cost (functional spec §9): a Tile labelled "Estimated cost" showing formatMinor(costCents) and,
 * when unpriced > 0, "<n> without a price". When nothing is priced at all (costCents 0 and unpriced > 0) the amount
 * is "—". Render only. Stub until implemented.
 */
export function CostTile(props: CostTileProps) {
  void props
  return null
}
