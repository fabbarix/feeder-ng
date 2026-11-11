import type { ReactNode } from 'react'
import { Tile } from '../../../ui'
import { importStrings as s } from '../strings'
import { CopyAgentPromptButton } from './CopyAgentPromptButton'

/** The Agent Prompt step of the import, to copy into any AI assistant (ui-fix-plan 2.8). `step` is its number: 2 with the other steps, 1 during the review. */
export function AgentPromptStep({ step = 2 }: { step?: number }): ReactNode {
  return (
    <Tile as="section" overline={s.stepOverline(step)} overlineIcon="agentPrompt">
      <h2>{s.stepOneTitle}</h2>
      <p>{s.agentPromptHelp}</p>
      <CopyAgentPromptButton />
    </Tile>
  )
}
