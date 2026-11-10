import { useEffect, type ReactNode } from 'react'
import { useAgentPrompt } from '../hooks/useAgentPrompt'
import { Button, useToast } from '../../../ui'
import { importStrings as s } from '../strings'

type Outcome = 'copied' | 'failed'

/** Announces the outcome of a copy as a Toast (success or error); mounted only once there is an outcome. */
export function AgentPromptNotice({ outcome }: { outcome: Outcome }): ReactNode {
  const toast = useToast()
  useEffect(() => {
    if (outcome === 'copied') toast.show(s.agentPromptCopied, { status: 'success' })
    else toast.show(s.agentPromptFailed, { status: 'error' })
  }, [outcome])
  return null
}

/** The primary Button "Copy Agent Prompt" (copy icon). The result is a Toast, never a stray status line. */
export function CopyAgentPromptButton(): ReactNode {
  const { state, copy } = useAgentPrompt()
  return (
    <>
      <Button icon="copy" loading={state === 'copying'} onClick={() => void copy()}>
        {s.copyAgentPrompt}
      </Button>
      {state === 'copied' || state === 'failed' ? <AgentPromptNotice outcome={state} /> : null}
    </>
  )
}
