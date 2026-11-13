// The units a Base recipe's Yield (and a Batch's yield amount) can have: the weights and volumes of the global units, piece and portion.
// Plain TypeScript, no React: the one list the UI and the Base recipe logic share.

export const YIELD_UNITS: readonly string[] = ['g', 'kg', 'ml', 'l', 'dl', 'cl', 'tsp', 'tbsp', 'cup', 'piece', 'portion']
