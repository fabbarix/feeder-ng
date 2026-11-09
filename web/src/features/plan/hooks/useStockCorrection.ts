import { useCallback, useState } from 'react'
import { planApi } from '../api'

export interface UseStockCorrection {
  /** Sets the Ingredient's Stock total (T10's Set total). */
  correct: (ingredientId: number, total: number) => Promise<boolean>
  busy: boolean
  error: string | null
}

export function useStockCorrection(): UseStockCorrection {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const correct = useCallback(async (ingredientId: number, total: number) => {
    setBusy(true)
    setError(null)
    try {
      await planApi.setStockTotal(ingredientId, total)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [])
  return { correct, busy, error }
}
