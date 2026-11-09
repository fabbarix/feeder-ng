export interface UseStockCorrection {
  /** Sets the Ingredient's Stock total (T10's Set total). */
  correct: (ingredientId: number, total: number) => Promise<boolean>
  busy: boolean
  error: string | null
}

export function useStockCorrection(): UseStockCorrection {
  return { correct: async () => false, busy: false, error: null }
}
