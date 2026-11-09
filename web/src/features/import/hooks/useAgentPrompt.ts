import { useCallback, useState } from 'react'
import { importApi } from '../api'

export interface UseAgentPrompt {
  state: 'idle' | 'copying' | 'copied' | 'failed'
  /** Fetches the prompt and writes it to the clipboard; state follows. */
  copy: () => Promise<void>
}

/** Copy Agent Prompt: `importApi.agentPrompt()` then `navigator.clipboard.writeText`. A failure of either is state 'failed'. */
export function useAgentPrompt(): UseAgentPrompt {
  const [state, setState] = useState<UseAgentPrompt['state']>('idle')
  const copy = useCallback(async () => {
    setState('copying')
    try {
      const text = await importApi.agentPrompt()
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
  }, [])
  return { state, copy }
}
