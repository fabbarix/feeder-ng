import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CopyAgentPromptButton } from './CopyAgentPromptButton'
import { importStrings as s } from '../strings'

/** The Recipes list slot: Import (link to /recipes/import), Export (link to /recipes/export) and CopyAgentPromptButton. */
export function RecipeFileActions(): ReactNode {
  return (
    <div className="recipe-file-actions">
      <Link className="button" data-variant="tonal" to="/recipes/import">{s.importAction}</Link>
      <Link className="button" data-variant="tonal" to="/recipes/export">{s.exportAction}</Link>
      <CopyAgentPromptButton />
    </div>
  )
}
