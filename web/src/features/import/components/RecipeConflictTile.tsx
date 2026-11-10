import type { ReactNode } from 'react'
import { Chip, Tile } from '../../../ui'
import { importStrings as s } from '../strings'
import type { RecipeAction, RecipeStatus } from '../types'

export interface RecipeConflictTileProps {
  recipe: RecipeStatus
  onChoose: (action: RecipeAction) => void
}

/** importStrings.conflictTitle(name) and three Chips (Replace, Keep both, Skip) with aria-pressed from recipe.action; when keep_both is chosen shows importStrings.importedAs(recipe.importedAs). Nothing is pressed while unanswered. */
export function RecipeConflictTile({ recipe, onChoose }: RecipeConflictTileProps): ReactNode {
  const options: Array<{ action: RecipeAction; label: string }> = [
    { action: 'replace', label: s.replace },
    { action: 'keep_both', label: s.keepBoth },
    { action: 'skip', label: s.skip },
  ]
  return (
    <Tile as="section">
      <h2>{s.conflictTitle(recipe.name)}</h2>
      <div className="import-chips">
        {options.map((o) => (
          <Chip key={o.action} kind="filter" selected={recipe.action === o.action} onClick={() => onChoose(o.action)}>
            {o.label}
          </Chip>
        ))}
      </div>
      {recipe.action === 'keep_both' && recipe.importedAs ? <p>{s.importedAs(recipe.importedAs)}</p> : null}
    </Tile>
  )
}
