import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../lib/http'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { BentoGrid, Button, Chip, Tile } from '../../../ui'
import { IngredientLinesList } from '../components/IngredientLinesList'
import { PreferenceToggles } from '../components/PreferenceToggles'
import { StepsList } from '../components/StepsList'
import { useIngredientRefs } from '../hooks/useIngredientRefs'
import { useRecipe } from '../hooks/useRecipe'
import { useRecipePreferences } from '../hooks/useRecipePreferences'
import { formatMinutes } from '../lib/time'
import { tileArt } from '../lib/tileArt'
import { codeMessage, recipeStrings } from '../strings'
import type { PreferenceState } from '../types'

/**
 * Route /recipes/:id: the photo (or generated tile), total time and Advance Steps, Yield, the ingredient
 * lines with the Member's Exclusions, the Steps, the Member's Favourite / Dislike / Exclusion, and the
 * actions: Edit, Archive or Unarchive, Delete (refused once the Recipe was planned).
 */
export function RecipeDetailScreen(): ReactNode {
  const navigate = useNavigate()
  const { id } = useParams()
  const recipeId = Number(id)
  const recipe = useRecipe(recipeId)
  const prefs = useRecipePreferences()
  const refs = useIngredientRefs()
  const system = useDisplayUnitSystem()
  const [error, setError] = useState<string | null>(null)

  if (recipe.isLoading) return <p>{recipeStrings.loading}</p>
  const r = recipe.recipe
  if (!r) return <p role="alert">{recipeStrings.loadError}</p>

  const current = prefs.stateOf(r.id)
  // The toggles report the next state; clearing a state re-taps the one it had.
  const toggle = (next: PreferenceState) => {
    const tapped = next === 'none' ? current : next
    if (tapped !== 'none') void prefs.toggleRecipe(r.id, tapped)
  }
  const art = tileArt(r.name, r.tags)

  const archive = async () => {
    setError(null)
    try {
      await recipe.setArchived(!r.archived)
    } catch (err) {
      setError(err instanceof ApiError ? codeMessage(err.code) : recipeStrings.generic)
    }
  }

  const remove = async () => {
    if (!window.confirm(recipeStrings.deleteConfirm)) return
    setError(null)
    try {
      await recipe.remove()
      navigate('/recipes')
    } catch (err) {
      setError(err instanceof ApiError ? codeMessage(err.code) : recipeStrings.generic)
    }
  }

  return (
    <section>
      <h1>{r.name}</h1>
      {r.imageUrl ? (
        <img src={r.imageUrl} alt="" className="recipe-photo" />
      ) : (
        <div className="recipe-tile__art" data-testid="recipe-art" data-icon={art.icon} data-tone={art.tone}>
          <span aria-hidden="true">{art.initial}</span>
        </div>
      )}
      <BentoGrid columns={2}>
        <Tile size="sm" tone="accent">
          <span>{r.totalMinutes > 0 ? recipeStrings.totalTime(formatMinutes(r.totalMinutes)) : recipeStrings.noSteps}</span>
        </Tile>
        <Tile size="sm">
          <span>{recipeStrings.yieldLabel(String(r.yield))}</span>
          {r.readyMeal ? <Chip>{recipeStrings.readyMeal}</Chip> : null}
        </Tile>
        {r.advance.length > 0 ? (
          <Tile size="wide" tone="leftover">
            <h2>{recipeStrings.advanceSteps}</h2>
            <ul>
              {r.advance.map((a) => (
                <li key={a.step}>
                  +{formatMinutes(a.leadTimeMinutes)} {r.steps[a.step]?.text}
                </li>
              ))}
            </ul>
          </Tile>
        ) : null}
        <Tile size="full">
          <h2>{recipeStrings.ingredients}</h2>
          <IngredientLinesList
            lines={r.lines}
            refs={refs.byId}
            system={system}
            exclusions={
              prefs.noMember
                ? undefined
                : { isExcluded: prefs.isExcluded, onToggle: (ingredientId) => void prefs.toggleIngredient(ingredientId) }
            }
          />
        </Tile>
        <Tile size="full">
          <h2>{recipeStrings.stepsTitle}</h2>
          <StepsList steps={r.steps} />
        </Tile>
        {prefs.noMember ? (
          <Tile size="full">
            <p>{recipeStrings.noMemberPreferences}</p>
          </Tile>
        ) : (
          <Tile size="full">
            <h2>{recipeStrings.preferences}</h2>
            <PreferenceToggles state={current} onChange={(next) => void toggle(next)} />
          </Tile>
        )}
      </BentoGrid>
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <Button variant="tonal" onClick={() => navigate(`/recipes/${r.id}/edit`)}>
          {recipeStrings.edit}
        </Button>
        <Button variant="ghost" onClick={() => void archive()}>
          {r.archived ? recipeStrings.unarchive : recipeStrings.archive}
        </Button>
        <Button variant="ghost" onClick={() => void remove()}>
          {recipeStrings.delete}
        </Button>
      </div>
    </section>
  )
}
