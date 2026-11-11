import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { cookRecipePath } from '../../cook'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { Chip, ErrorState, IconButton, Menu, PageHeader, RecipeThumb, Skeleton, StickyActionBar, Tile, useMediaQuery } from '../../../ui'
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
 * count. Edit is in the header; Archive and Delete are in the More actions Menu (Delete asks in a ConfirmDialog). From 1280 px the left column holds the photo, metrics, Ingredients and the Cook entry; below, the Cook entry is a StickyActionBar.
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
  const wide = useMediaQuery('(min-width: 1280px)')
  const r = recipe.recipe
  const crumbs = useBreadcrumbs(r?.name)
  const actions = useRecipeActions(recipe, { name: r?.name ?? '', archived: r?.archived ?? false }, () => navigate('/recipes'))

  if (recipe.isLoading) return <Skeleton variant="tile" count={3} />
  if (!r)
    return (
      <section className="recipe-detail">
        <PageHeader title={recipeStrings.title} breadcrumbs={crumbs} />
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
  const cook = (
    <CookEntry
      batches={batches}
      onBatchesChange={setBatches}
      yieldValue={r.yield}
      onStart={() => navigate(cookRecipePath(r.id, batches))}
    />
  )
  const thumb = <RecipeThumb name={r.name} photoUrl={r.imageUrl || undefined} tags={r.tags} size="hero" />

  return (
    <section className="recipe-detail">
      <PageHeader
        title={r.name}
        breadcrumbs={crumbs}
        actions={
          <>
            <IconButton icon="edit" label={recipeStrings.edit} onClick={() => navigate(`/recipes/${r.id}/edit`)} />
            <Menu
              label={recipeStrings.more}
              title={recipeStrings.overflow.title}
              items={[
                {
                  id: 'archive',
                  label: r.archived ? recipeStrings.unarchive : recipeStrings.archive,
                  icon: r.archived ? 'unarchive' : 'archive',
                  onSelect: () => void actions.archive(),
                },
                {
                  id: 'delete',
                  label: recipeStrings.delete,
                  icon: 'delete',
                  tone: 'danger',
                  onSelect: () => void actions.remove(),
                },
              ]}
            />
          </>
        }
      />
      <div className="recipe-detail__layout">
        <div className="recipe-detail__aside">
          <Tile variant="media" className="recipe-detail__hero" media={thumb}>
            {r.archived ? <Chip kind="tag">{recipeStrings.archived}</Chip> : null}
          </Tile>
          <RecipeMetrics
            yieldText={String(r.yield)}
            readyMeal={r.readyMeal}
            totalMinutes={r.totalMinutes}
            advanceMinutes={r.advanceMinutes}
          />
          <Tile as="section">
            <h2>{recipeStrings.ingredients}</h2>
            <IngredientLinesList
              lines={r.lines}
              refs={refs.byId}
              system={system}
              exclusions={
                noMember
                  ? undefined
                  : {
                      isExcluded: prefs.isExcluded,
                      onToggle: (ingredientId) => void prefs.toggleIngredient(ingredientId),
                    }
              }
            />
          </Tile>
          {wide ? cook : null}
        </div>
        <div className="recipe-detail__main">
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
        </div>
      </div>
      {actions.error ? <ErrorState message={actions.error} /> : null}
      {wide ? null : <StickyActionBar label={recipeStrings.cook.barLabel}>{cook}</StickyActionBar>}
    </section>
  )
}
