import type { ReactElement } from 'react'
import { Icon } from '../../../ui'
import type { IconName } from '../../../ui/icons'
import type { SetupTileActions } from '../hooks/useSetupChecklist'
import { todayStrings as s } from '../strings'

export interface RecipeWaysProps {
  have: number
  want: number
  actions: Pick<SetupTileActions, 'newRecipe' | 'readRecipe' | 'importRecipes'>
}

/** Step 4: "1 of 5 Recipes", the three ways to add Recipes as outlined 56 px row-buttons, and (once there is one) the line about the plan. */
export function RecipeWays({ have, want, actions }: RecipeWaysProps): ReactElement {
  const ways: { id: keyof typeof s.setupWays; icon: IconName; run: () => void }[] = [
    { id: 'newRecipe', icon: 'edit', run: actions.newRecipe },
    { id: 'readRecipe', icon: 'camera', run: actions.readRecipe },
    { id: 'importRecipes', icon: 'import', run: actions.importRecipes },
  ]
  return (
    <>
      <p className="setup-count">{s.setupRecipesCount(have, want)}</p>
      <div className="setup-ways">
        {ways.map((way, i) => (
          <button key={way.id} type="button" className="setup-way" data-step-primary={i === 0 ? '' : undefined} onClick={way.run}>
            <span className="setup-way__icon" aria-hidden="true">
              <Icon name={way.icon} size={20} />
            </span>
            <span className="setup-way__text">
              <span className="setup-way__label">{s.setupWays[way.id].label}</span>
              <span className="setup-way__detail">{s.setupWays[way.id].detail}</span>
            </span>
          </button>
        ))}
      </div>
      {have > 0 ? <p className="setup-note">{s.setupFirstPlanNote}</p> : null}
    </>
  )
}
