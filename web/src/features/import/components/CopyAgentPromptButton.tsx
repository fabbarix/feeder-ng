import type { ReactNode } from 'react'
import { useAgentPrompt } from '../hooks/useAgentPrompt'
import { Button } from '../../../ui'
import { importStrings as s } from '../strings'

/** A Button labelled importStrings.copyAgentPrompt that uses useAgentPrompt; afterwards says importStrings.agentPromptCopied (or agentPromptFailed) in a role="status" region. */
export function CopyAgentPromptButton(): ReactNode {
  const { state, copy } = useAgentPrompt()
  const message = state === 'copied' ? s.agentPromptCopied : state === 'failed' ? s.agentPromptFailed : ''
  return (
    <>
      <Button variant="tonal" loading={state === 'copying'} onClick={() => void copy()}>
        {s.copyAgentPrompt}
      </Button>
      <p role="status">{message}</p>
    </>
  )
}
