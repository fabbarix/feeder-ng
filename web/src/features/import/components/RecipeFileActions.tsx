import type { ReactNode } from 'react'
import { ListGroup, ListRow } from '../../../ui'
import { useAgentPrompt } from '../hooks/useAgentPrompt'
import { importStrings as s } from '../strings'
import { AgentPromptNotice } from './CopyAgentPromptButton'

/** The Recipe File actions as the rows of one list (in the More sheet): Import and Export link to their screens, Copy Agent Prompt copies. */
export function RecipeFileActions(): ReactNode {
  const { state, copy } = useAgentPrompt()
  return (
    <>
      <ListGroup label={s.sourceTitle}>
        <ListRow title={s.importAction} icon="import" href="/recipes/import" chevron />
        <ListRow title={s.exportAction} icon="export" href="/recipes/export" chevron />
        <ListRow
          title={s.copyAgentPrompt}
          icon="agentPrompt"
          meta={s.agentPromptHelp}
          onActivate={() => void copy()}
        />
      </ListGroup>
      {state === 'copied' || state === 'failed' ? <AgentPromptNotice outcome={state} /> : null}
    </>
  )
}
