// Per pack <-> per kg (per l for ml) for the Price entry (shop-scan-proposals.md 13.4, S3). Integer maths, rounding half up
// (the same as the server's product.PriceForWeight). Pieces have a Price per pack only. Plain TypeScript, no React.

export type PackUnit = 'g' | 'ml' | 'piece'
export type PriceBasis = 'pack' | 'perKg'

/** Only grams and millilitres have a per kg (per l) Price. */
export function supportsPerKg(unit: PackUnit): boolean {
  return unit !== 'piece'
}

/** The per pack / per kg switch: none for pieces (S3). */
export function priceBasisOptions(unit: PackUnit): { value: PriceBasis; label: string }[] {
  if (!supportsPerKg(unit)) return []
  return [
    { value: 'pack', label: 'per pack' },
    { value: 'perKg', label: unit === 'ml' ? 'per l' : 'per kg' },
  ]
}

/** Price per kg (per l) of a pack: cents * 1000 / amount, half up. Null for pieces or an amount that is not above 0. */
export function perKgFromPack(packCents: number, amount: number, unit: PackUnit): number | null {
  if (!supportsPerKg(unit) || amount <= 0) return null
  return Math.floor((2 * packCents * 1000 + amount) / (2 * amount))
}

/** Pack Price of a per kg (per l) Price for a pack of `amount`: cents * amount / 1000, half up. */
export function packFromPerKg(perKgCents: number, amount: number, unit: PackUnit): number | null {
  if (!supportsPerKg(unit) || amount <= 0) return null
  return Math.floor((perKgCents * amount + 500) / 1000)
}

/** What a weighed amount in g or ml costs at a per kg Price: cents * grams / 1000, half up. */
export function weighedPrice(perKgCents: number, grams: number): number {
  return Math.floor((perKgCents * grams + 500) / 1000)
}
