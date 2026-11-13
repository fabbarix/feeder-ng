import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { useCourses } from '../../../lib/courses/useCourses'
import { cookRecipePath } from '../../cook'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { Button, Chip, Dialog, ErrorState, IconButton, Menu, PageHeader, RecipeThumb, Skeleton, StickyActionBar, Tile, useMediaQuery } from '../../../ui'
import { BaseRecipeBadge } from '../components/BaseRecipeBadge'
import { LinkCandidatesSheet } from '../components/LinkCandidatesSheet'
import { useBaseLinkCandidates } from '../hooks/useBaseLinkCandidates'
import { useBaseRecipeStock } from '../hooks/useBaseRecipeStock'
import { LineLinkSession, type LineSession } from '../components/LineLinkSession'
import { usedInText, yieldText } from '../lib/baseRecipe'
import { CookEntry } from '../components/CookEntry'
import { CourseChips } from '../components/CourseChips'
import { IngredientExclusionList } from '../components/IngredientExclusionList'
import { IngredientLinesList } from '../components/IngredientLinesList'
import { PreferenceTable } from '../components/PreferenceTable'
import { RecipeMetrics } from '../components/RecipeMetrics'
import { RecipeTags } from '../components/RecipeTags'
import { StepsList } from '../components/StepsList'
import { useHashTarget } from '../hooks/useHashTarget'
import { useHouseholdPreferences } from '../hooks/useHouseholdPreferences'
import { useIngredientRefs } from '../hooks/useIngredientRefs'
import { useRecipe } from '../hooks/useRecipe'
import { useRecipeActions } from '../hooks/useRecipeActions'
import { useRecipeTags } from '../hooks/useRecipeTags'
import { excludersOf, preferenceRows } from '../lib/preferenceRows'
import { lastCookedLabel, localToday } from '../lib/lastCooked'
import { recipesTagPath } from '../lib/tags'
import { showsWholeMeal } from '../lib/recipeCourses'
import { recipeStrings } from '../strings'
import type { Recipe } from '../types'
import '../recipes.css'

/**
 * Route /recipes/:id: the photo, the metrics (Yield, time and the Advance Step lead), the ingredient lines (with who
 * excludes each Ingredient, changed in a Dialog), the Steps, the preferences of the whole Household as a table, and
 * "Start Cook Mode" with the Batch count. Edit is in the header; Archive and Delete are in the More actions Menu
 * (Delete asks in a ConfirmDialog). From 1280 px the left column holds the photo, metrics, Ingredients and the Cook
 * entry; below, the Cook entry is a StickyActionBar.
 */
export function RecipeDetailScreen(): ReactNode {
  const navigate = useNavigate()
  const { id } = useParams()
  const recipeId = Number(id)
  const recipe = useRecipe(recipeId)
  const household = useHouseholdPreferences()
  const highlighted = useHashTarget('preference-member-')
  const refs = useIngredientRefs()
  const system = useDisplayUnitSystem()
  const [batches, setBatches] = useState(1)
  const [excluding, setExcluding] = useState<{ id: number; name: string } | null>(null)
  const wide = useMediaQuery('(min-width: 1280px)')
  const { choices } = useCourses()
  const r = recipe.recipe
  const crumbs = useBreadcrumbs(r?.name)
  const actions = useRecipeActions(recipe, { name: r?.name ?? '', archived: r?.archived ?? false }, () => navigate('/recipes'))
  const { colourOf } = useRecipeTags()
  // BR-D: a line action (Link to a Base recipe, Use as a plain Ingredient) runs as a session; a change refetches the Recipe and its candidates.
  const [session, setSession] = useState<LineSession | null>(null)
  const [candidateTick, setCandidateTick] = useState(0)
  const [lineError, setLineError] = useState<string | null>(null)
  const refreshAll = () => {
    recipe.refetch()
    setCandidateTick((n) => n + 1)
  }

  if (recipe.isLoading) return <Skeleton variant="tile" count={3} />
  if (!r)
    return (
      <section className="recipe-detail">
        <PageHeader title={recipeStrings.title} breadcrumbs={crumbs} />
        <ErrorState message={recipeStrings.loadError} onRetry={() => recipe.refetch()} />
      </section>
    )

  const rows = preferenceRows(household.members, household.prefsByMember, r.id, r.lines, household.meUserId)
  const cook = (
    <CookEntry
      batches={batches}
      onBatchesChange={setBatches}
      yieldValue={r.yield}
      onStart={() => navigate(cookRecipePath(r.id, batches))}
    />
  )
  const thumb = <RecipeThumb name={r.name} photoUrl={r.imageUrl || undefined} tags={r.tags} size="hero" />
  const isBase = r.baseRecipe === true

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
      {isBase ? <BaseRecipeSection recipe={r} refreshKey={candidateTick} onChanged={refreshAll} /> : null}
      <div className="recipe-detail__layout">
        <div className="recipe-detail__aside">
          <Tile variant="media" className="recipe-detail__hero" media={thumb}>
            {r.archived ? <Chip kind="tag">{recipeStrings.archived}</Chip> : null}
            <CourseChips
              names={r.courses.map((c) => c.name)}
              wholeMeal={r.wholeMeal && showsWholeMeal(r.courses.map((c) => c.id), choices)}
            />
            <RecipeTags tags={r.tags} colourOf={colourOf} onOpen={(name) => navigate(recipesTagPath(name))} />
          </Tile>
          <RecipeMetrics
            yieldText={String(r.yield)}
            readyMeal={r.readyMeal}
            totalMinutes={r.totalMinutes}
            advanceMinutes={r.advanceMinutes}
            lastCooked={lastCookedLabel(r.lastCookedOn, localToday())}
          />
          <Tile as="section">
            <h2>{recipeStrings.ingredients}</h2>
            <IngredientLinesList
              lines={r.lines}
              refs={refs.byId}
              system={system}
              onLinkToBase={(line) => setSession({ kind: 'picker', line })}
              onUseAsPlain={(line) => setSession({ kind: 'plain', line })}
              excludedBy={{
                members: (ingredientId) => excludersOf(household.members, household.prefsByMember, ingredientId),
                onOpen: (ingredientId, name) => setExcluding({ id: ingredientId, name }),
              }}
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
            {household.isLoading ? (
              <Skeleton variant="tile" />
            ) : (
              <PreferenceTable
                exclusionOnly={isBase}
                recipeName={r.name}
                rows={rows}
                onToggle={(memberId, tapped) => void household.toggleRecipe(memberId, r.id, tapped)}
                highlightedMemberId={highlighted}
                isAdmin={household.isAdmin}
                error={household.isError}
                onRetry={household.refetch}
              />
            )}
          </Tile>
        </div>
      </div>
      <Dialog open={excluding !== null} onClose={() => setExcluding(null)} title={excluding ? recipeStrings.whoExcludes(excluding.name) : ''}>
        {excluding ? <IngredientExclusionList ingredientId={excluding.id} ingredientName={excluding.name} /> : null}
      </Dialog>
      {session ? (
        <LineLinkSession
          recipeId={r.id}
          session={session}
          refs={refs.byId}
          // a successful line action clears the words of an earlier refusal
          onChanged={() => {
            setLineError(null)
            refreshAll()
          }}
          onDone={() => setSession(null)}
          onFailed={setLineError}
        />
      ) : null}
      {lineError ? <p role="alert">{lineError}</p> : null}
      {actions.error ? <ErrorState message={actions.error} /> : null}
      {wide ? null : <StickyActionBar label={recipeStrings.cook.barLabel}>{cook}</StickyActionBar>}
    </section>
  )
}

/**
 * BR-D: a Base recipe's own facts: the Yield, the Pantry's Stock of it, the Recipes that call for it (links), and the candidates row (its copy is in the
 * strings) that opens the bulk link list while any plain line of that name is left. A child component, so a plannable Recipe never asks for candidates or Stock.
 */
function BaseRecipeSection({ recipe: r, refreshKey, onChanged }: { recipe: Recipe; refreshKey: number; onChanged: () => void }): ReactNode {
  const candidates = useBaseLinkCandidates(r.id, true)
  const stock = useBaseRecipeStock(r.baseIngredientId)
  const [sheetOpen, setSheetOpen] = useState(false)
  useEffect(() => {
    if (refreshKey > 0) candidates.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the screen reports a link change
  }, [refreshKey])
  const used = r.usedBy ?? []
  const t = recipeStrings.baseRecipe
  return (
    <>
      <Tile as="section" span="full" aria-label={t.badge}>
        <p>
          <BaseRecipeBadge /> <span>{t.yieldLine(yieldText(r.yield, r.yieldUnit))}</span>
        </p>
        {stock.line ? <p>{stock.line}</p> : null}
        <h2>{usedInText(used.length)}</h2>
        {used.length === 0 ? null : (
          <p>
            {used.map((u, i) => (
              <span key={u.id}>
                {i > 0 ? ', ' : null}
                <Link to={`/recipes/${u.id}`}>{u.name}</Link>
              </span>
            ))}
          </p>
        )}
        {candidates.count > 0 ? (
          <Button variant="tertiary" onClick={() => setSheetOpen(true)}>
            {t.candidatesRow(candidates.ingredientName, candidates.count)}
          </Button>
        ) : null}
      </Tile>
      {sheetOpen ? (
        <LinkCandidatesSheet
          open
          baseRecipe={{ id: r.id, name: r.name, ingredientId: r.baseIngredientId ?? 0 }}
          onClose={() => {
            setSheetOpen(false)
            candidates.refetch()
          }}
          onChanged={onChanged}
        />
      ) : null}
    </>
  )
}
