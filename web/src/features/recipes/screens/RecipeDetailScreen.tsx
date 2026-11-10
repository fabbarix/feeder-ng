import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { cookRecipePath } from '../../cook'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { BottomSheet, Chip, ErrorState, IconButton, ListGroup, ListRow, PageHeader, RecipeThumb, Skeleton, Tile } from '../../../ui'
import { CookEntry } from '../components/CookEntry'
import { IngredientLinesList } from '../components/IngredientLinesList'
import { MemberPicker } from '../components/MemberPicker'
import { PreferenceToggles } from '../components/PreferenceToggles'
import { RecipeMetrics } from '../components/RecipeMetrics'
import { StepsList } from '../components/StepsList'
import { useIngredientRefs } from '../hooks/useIngredientRefs'
import { useMemberPicker } from '../hooks/useMemberPicker'
import { useRecipe } from '../hooks/useRecipe'
import { useRecipeActions } from '../hooks/useRecipeActions'
import { useRecipePreferences } from '../hooks/useRecipePreferences'
import { recipeStrings } from '../strings'
import type { PreferenceState } from '../types'
import '../recipes.css'

/**
 * Route /recipes/:id: the photo, the metrics (Yield, time and the Advance Step lead), the ingredient lines with the
 * Member's Exclusions, the Steps, the Member's preferences (picked Member first), and "Start Cook Mode" with the Batch
 * count. Edit is in the header; Archive and Delete are in the More sheet (Delete asks in a ConfirmDialog).
 */
export function RecipeDetailScreen(): ReactNode {
  const navigate = useNavigate()
  const { id } = useParams()
  const recipeId = Number(id)
  const recipe = useRecipe(recipeId)
  const picker = useMemberPicker()
  const prefs = useRecipePreferences(picker.memberId)
  const refs = useIngredientRefs()
  const system = useDisplayUnitSystem()
  const [batches, setBatches] = useState(1)
  const [sheetOpen, setSheetOpen] = useState(false)
  const r = recipe.recipe
  const actions = useRecipeActions(recipe, { name: r?.name ?? '', archived: r?.archived ?? false }, () => navigate('/recipes'))

  if (recipe.isLoading) return <Skeleton variant="tile" count={3} />
  if (!r)
    return (
      <section className="recipe-detail">
        <PageHeader
          title={recipeStrings.title}
          leading={<IconButton icon="back" label={recipeStrings.back} onClick={() => navigate('/recipes')} />}
        />
        <ErrorState message={recipeStrings.loadError} onRetry={() => recipe.refetch()} />
      </section>
    )

  const current = prefs.stateOf(r.id)
  // The toggles report the next state; clearing a state re-taps the one it had.
  const toggle = (next: PreferenceState) => {
    const tapped = next === 'none' ? current : next
    if (tapped !== 'none') void prefs.toggleRecipe(r.id, tapped)
  }
  const noMember = picker.selectedId === null || prefs.noMember
  const thumb = <RecipeThumb name={r.name} photoUrl={r.imageUrl || undefined} tags={r.tags} size="hero" />

  return (
    <section className="recipe-detail">
      <PageHeader
        title={r.name}
        leading={<IconButton icon="back" label={recipeStrings.back} onClick={() => navigate('/recipes')} />}
        actions={
          <>
            <IconButton icon="edit" label={recipeStrings.edit} onClick={() => navigate(`/recipes/${r.id}/edit`)} />
            <IconButton icon="more" label={recipeStrings.more} onClick={() => setSheetOpen(true)} />
          </>
        }
      />
      <Tile variant="media" className="recipe-detail__hero" media={thumb}>
        {r.archived ? <Chip kind="tag">{recipeStrings.archived}</Chip> : null}
      </Tile>
      <RecipeMetrics yieldText={String(r.yield)} readyMeal={r.readyMeal} totalMinutes={r.totalMinutes} advanceMinutes={r.advanceMinutes} />
      <Tile as="section">
        <h2>{recipeStrings.ingredients}</h2>
        <IngredientLinesList
          lines={r.lines}
          refs={refs.byId}
          system={system}
          exclusions={noMember ? undefined : { isExcluded: prefs.isExcluded, onToggle: (ingredientId) => void prefs.toggleIngredient(ingredientId) }}
        />
      </Tile>
      <Tile as="section">
        <h2>{recipeStrings.stepsTitle}</h2>
        {r.steps.length === 0 ? <p>{recipeStrings.steps.empty}</p> : <StepsList steps={r.steps} refs={refs.byId} system={system} />}
      </Tile>
      <Tile as="section">
        <h2>{recipeStrings.preferences}</h2>
        <MemberPicker members={picker.members} selectedId={picker.selectedId} onPick={picker.select} />
        {noMember ? <p className="recipe-detail__hint">{recipeStrings.memberPicker.pickFirst}</p> : null}
        <PreferenceToggles state={current} disabled={noMember} onChange={toggle} />
      </Tile>
      {actions.error ? <ErrorState message={actions.error} /> : null}
      <CookEntry batches={batches} onBatchesChange={setBatches} yieldValue={r.yield} onStart={() => navigate(cookRecipePath(r.id, batches))} />
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={recipeStrings.overflow.title}>
        <ListGroup label={recipeStrings.overflow.title}>
          <ListRow
            title={r.archived ? recipeStrings.unarchive : recipeStrings.archive}
            icon={r.archived ? 'unarchive' : 'archive'}
            onActivate={() => {
              setSheetOpen(false)
              void actions.archive()
            }}
          />
          <ListRow
            title={recipeStrings.delete}
            icon="delete"
            onActivate={() => {
              setSheetOpen(false)
              void actions.remove()
            }}
          />
        </ListGroup>
      </BottomSheet>
    </section>
  )
}
