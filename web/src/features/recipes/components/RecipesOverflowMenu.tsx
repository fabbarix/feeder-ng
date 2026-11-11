import type { ReactNode } from 'react'
import { Menu } from '../../../ui'
import { AgentPromptNotice } from '../../import/components/CopyAgentPromptButton'
import { useAgentPrompt } from '../../import/hooks/useAgentPrompt'
import { importStrings, readStrings } from '../../import/strings'
import { recipeStrings } from '../strings'

export interface RecipesOverflowMenuProps {
  showArchived: boolean
  onShowArchivedChange: (on: boolean) => void
}

/**
 * The Recipes "More actions" Menu (G-01): Read a recipe, Import and Export (links), Copy Agent Prompt (its outcome is a Toast) and the
 * "Show archived" switch. A popover from 768 px, the "More" sheet below.
 */
export function RecipesOverflowMenu({ showArchived, onShowArchivedChange }: RecipesOverflowMenuProps): ReactNode {
  const { state, copy } = useAgentPrompt()
  return (
    <>
      <Menu
        label={recipeStrings.more}
        title={recipeStrings.overflow.title}
        items={[
          {
            id: 'read',
            label: readStrings.stepTitle,
            icon: 'recipes',
            href: '/recipes/import#read',
          },
          {
            id: 'import',
            label: importStrings.importAction,
            icon: 'import',
            href: '/recipes/import',
          },
          {
            id: 'export',
            label: importStrings.exportAction,
            icon: 'export',
            href: '/recipes/export',
          },
          {
            id: 'agent-prompt',
            label: importStrings.copyAgentPrompt,
            icon: 'agentPrompt',
            onSelect: () => void copy(),
          },
          {
            id: 'archived',
            label: recipeStrings.overflow.showArchived,
            checked: showArchived,
            onSelect: () => onShowArchivedChange(!showArchived),
          },
        ]}
      />
      {state === 'copied' || state === 'failed' ? <AgentPromptNotice outcome={state} /> : null}
    </>
  )
}
