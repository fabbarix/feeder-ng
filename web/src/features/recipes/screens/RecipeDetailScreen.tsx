import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { useCourses } from '../../../lib/courses/useCourses'
import { cookRecipePath } from '../../cook'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { Button, Chip, Dialog, ErrorState, IconButton, Menu, PageHeader, RecipeThumb, Skeleton, StickyActionBar, Tile, useMediaQuery } from '../../../ui'
import { useLineLink, type SavedLine } from '../../../lib/baseRecipes/useLineLink'
import { BaseRecipeBadge } from '../components/BaseRecipeBadge'
import { BaseRecipePicker } from '../components/BaseRecipePicker'
import { LinkCandidatesSheet } from '../components/LinkCandidatesSheet'
import { TakeOverDialog } from '../components/TakeOverDialog'
import { useBaseLinkCandidates } from '../hooks/useBaseLinkCandidates'
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
import type { Recipe, RecipeLine } from '../types'
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
  // BR-D: the line links (Link to a Base recipe, Use as a plain Ingredient) save at once; a change refetches the Recipe and its candidates.
  const [pickerFor, setPickerFor] = useState<RecipeLine | null>(null)
  const [candidateTick, setCandidateTick] = useState(0)
  const links = useLineLink({
    recipeId,
    onChanged: () => {
      recipe.refetch()
      setCandidateTick((n) => n + 1)
    },
  })

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
  const savedLine = (line: RecipeLine): SavedLine => ({
    id: line.id ?? 0,
    ingredientName: line.ingredient ?? '',
    quantity: line.quantity,
    unit: line.unit,
    linkedFromIngredientId: line.linkedFromIngredientId ?? null,
    baseRecipe: line.baseRecipe ? { id: line.baseRecipe.id, name: line.baseRecipe.name } : null,
  })
  const isBase = r.baseRecipe === true
  const baseIngredient = r.baseIngredientId !== undefined ? refs.byId.get(r.baseIngredientId) : undefined

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
      {isBase ? <BaseRecipeSection recipe={r} baseUnit={baseIngredient?.baseUnit} refreshKey={candidateTick} /> : null}
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
              onLinkToBase={(line) => setPickerFor(line)}
              onUseAsPlain={(line) => {
                void links.useAsPlain(savedLine(line)).then((outcome) => {
                  if (outcome === 'pick') setPickerFor(line)
                })
              }}
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
      <BaseRecipePicker
        open={pickerFor !== null}
        lineName={pickerFor?.ingredient ?? ''}
        recipeId={r.id}
        onClose={() => setPickerFor(null)}
        onChoose={(choice) => {
          const line = pickerFor
          setPickerFor(null)
          if (line) void links.linkTo(savedLine(line), choice)
        }}
      />
      <TakeOverDialog
        ask={links.takeOverAsk}
        baseName={links.askName ?? ''}
        onAnswer={(yes) => void links.answerTakeOver(yes)}
        onCancel={links.cancelTakeOver}
      />
      {links.error ? <ErrorState message={links.error} /> : null}
      {actions.error ? <ErrorState message={actions.error} /> : null}
      {wide ? null : <StickyActionBar label={recipeStrings.cook.barLabel}>{cook}</StickyActionBar>}
    </section>
  )
}

/**
 * BR-D: a Base recipe's own facts: the Yield, the Recipes that call for it (links), and the row "Recipes with an Ingredient named béchamel (N)" that opens
 * the bulk link list while any plain line of that name is left. A child component, so a plannable Recipe never asks for candidates.
 */
function BaseRecipeSection({ recipe: r, baseUnit, refreshKey }: { recipe: Recipe; baseUnit: string | undefined; refreshKey: number }): ReactNode {
  const candidates = useBaseLinkCandidates(r.id, true)
  const [sheetOpen, setSheetOpen] = useState(false)
  useEffect(() => {
    if (refreshKey > 0) candidates.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the screen reports a link change
  }, [refreshKey])
  const used = r.usedBy ?? []
  return (
    <>
      <Tile as="section" span="full" aria-label={recipeStrings.baseRecipe.badge}>
        <p>
          <BaseRecipeBadge /> <span>{`Yield ${yieldText(r.yield, r.yieldUnit)}`}</span>
        </p>
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
            {`Recipes with an Ingredient named ${candidates.ingredientName} (${candidates.count})`}
          </Button>
        ) : null}
      </Tile>
      {sheetOpen && baseUnit !== undefined ? (
        <LinkCandidatesSheet
          open
          baseRecipe={{ id: r.id, name: r.name, baseUnit, ingredientId: r.baseIngredientId ?? 0 }}
          onClose={() => {
            setSheetOpen(false)
            candidates.refetch()
          }}
        />
      ) : null}
    </>
  )
}
