export interface UseAgentPrompt {
  state: 'idle' | 'copying' | 'copied' | 'failed'
  /** Fetches the prompt and writes it to the clipboard; state follows. */
  copy: () => Promise<void>
}

/** Copy Agent Prompt: `importApi.agentPrompt()` then `navigator.clipboard.writeText`. A failure of either is state 'failed'. */
export function useAgentPrompt(): UseAgentPrompt {
  throw new Error('not implemented')
}
