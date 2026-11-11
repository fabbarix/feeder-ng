import { useCallback, useRef, useState } from 'react'
import { recipeAssistantApi } from '../api'
import type { TestRequest, TestResult } from '../types'

/** Test connection with the unsaved values. A failed check is a result; a failed request is an error. */
export function useTestConnection() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TestResult | undefined>()
  const [error, setError] = useState<unknown>(undefined)
  const generation = useRef(0)

  const reset = useCallback(() => {
    generation.current += 1
    setRunning(false)
    setResult(undefined)
    setError(undefined)
  }, [])

  const run = useCallback(async (request: TestRequest) => {
    const mine = ++generation.current
    setRunning(true)
    setResult(undefined)
    setError(undefined)
    try {
      const answer = await recipeAssistantApi.testConnection(request)
      if (generation.current === mine) setResult(answer)
    } catch (err) {
      if (generation.current === mine) setError(err)
    } finally {
      if (generation.current === mine) setRunning(false)
    }
  }, [])

  return { run, running, result, error, reset }
}
