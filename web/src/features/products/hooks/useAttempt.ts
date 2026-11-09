import { useState } from 'react'
import { errorText } from '../lib/productForm'

/**
 * Runs a change and keeps its failure as `error` (the message to show in an alert). `attempt` resolves
 * true when the change succeeded, false when it failed; the error is cleared before each attempt.
 */
export function useAttempt() {
  const [error, setError] = useState<string | null>(null)
  const attempt = async (change: () => Promise<unknown>): Promise<boolean> => {
    setError(null)
    try {
      await change()
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    }
  }
  return { error, setError, attempt }
}
