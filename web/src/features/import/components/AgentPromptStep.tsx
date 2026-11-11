import type { ReactNode } from 'react'
import { Tile } from '../../../ui'
import { importStrings as s } from '../strings'
import { CopyAgentPromptButton } from './CopyAgentPromptButton'

/** Step 1 of the import: the Agent Prompt to copy into any AI assistant (ui-fix-plan 2.8). */
export function AgentPromptStep(): ReactNode {
  return (
    <Tile as="section" overline={s.stepOverline(2)} overlineIcon="agentPrompt">
      <h2>{s.stepOneTitle}</h2>
      <p>{s.agentPromptHelp}</p>
      <CopyAgentPromptButton />
    </Tile>
  )
}
