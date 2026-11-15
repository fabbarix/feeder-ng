import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { useCourses } from '../../../lib/courses/useCourses'
import { cookRecipePath } from '../../cook'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { ErrorState, IconButton, LoadState, Menu, PageHeader, RecipeThumb, Skeleton, StickyActionBar, Tile, useBreakpoint } from '../../../ui'
import { BaseRecipeSection } from '../components/BaseRecipeSection'
import { LineLinkSession, type LineSession } from '../components/LineLinkSession'
import { CookEntry } from '../components/CookEntry'
import { CookTile } from '../components/CookTile'
import { IngredientLinesList } from '../components/IngredientLinesList'
import { PreferenceTable } from '../components/PreferenceTable'
import { RecipeAbout } from '../components/RecipeAbout'
import { RecipeMetrics } from '../components/RecipeMetrics'
import { RecipeTags } from '../components/RecipeTags'
import { StepsList } from '../components/StepsList'
import { useHashTarget } from '../hooks/useHashTarget'
import { useHouseholdPreferences } from '../hooks/useHouseholdPreferences'
import { useIngredientRefs } from '../hooks/useIngredientRefs'
import { RecipeDetailSkeleton } from '../components/RecipeDetailSkeleton'
import { useRecipe } from '../hooks/useRecipe'
import { useRecipeActions } from '../hooks/useRecipeActions'
import { useRecipeTags } from '../hooks/useRecipeTags'
import { heroLeadChips } from '../lib/heroChips'
import { preferenceRows } from '../lib/preferenceRows'
import { lastCookedLabel, localToday } from '../lib/lastCooked'
import { recipesTagPath } from '../lib/tags'
import { recipeStrings } from '../strings'
import '../recipes-list.css'
import '../recipe-detail.css'

/**
 * Route /recipes/:id (RX-04): the lede (description and Source), then two columns from 45 rem of the page's own width: the side column
 * holds the hero (Photo and one chip line), the Cook tile (from 1024 px of viewport), the metric strip and the Ingredients; the main
 * column the Steps and the preferences of the whole Household. Below 1024 px the Cook entry is a StickyActionBar instead, never both.
 * Edit is in the header; Archive and Delete are in the More actions Menu (useRecipeActions: dialogs and toasts).
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
  // RX-04: the Cook tile from the side rail's breakpoint (1024 px), where no bottom bar floats over the page.
  const hasRail = useBreakpoint('desktop')
  const { choices } = useCourses()
  const r = recipe.recipe
  const crumbs = useBreadcrumbs(r?.name)
  const actions = useRecipeActions(
    recipe,
    { name: r?.name ?? '', archived: r?.archived ?? false, deletable: r?.deletable, deleteBlockedBy: r?.deleteBlockedBy, usedBy: r?.usedBy },
    () => navigate('/recipes'),
  )
  const { colourOf } = useRecipeTags()
  // BR-D: a line action (Link to a Base recipe, Use as a plain Ingredient) runs as a session; a change refetches the Recipe and its candidates.
  const [session, setSession] = useState<LineSession | null>(null)
  const [candidateTick, setCandidateTick] = useState(0)
  const [lineError, setLineError] = useState<string | null>(null)
  const refreshAll = () => {
    recipe.refetch()
    setCandidateTick((n) => n + 1)
  }

  // B9-20 (RES-02): one state model. Unknown offline is a LoadState (Try again could not work), never the error.
  if (!r) {
    const title = recipe.knownName ?? recipeStrings.detailTitle
    return (
      <section className="recipe-detail">
        <PageHeader title={title} breadcrumbs={crumbs} actions={recipe.state === 'loading' ? <RecipeDetailSkeleton.Actions /> : undefined} />
        {recipe.state === 'offlineUnknown' ? (
          <LoadState title={recipeStrings.detailOfflineTitle} text={recipeStrings.detailOfflineText} />
        ) : recipe.state === 'failed' ? (
          <ErrorState message={recipeStrings.loadError} onRetry={() => recipe.refetch()} />
        ) : (
          <RecipeDetailSkeleton label={recipeStrings.loading} />
        )}
      </section>
    )
  }

  const rows = preferenceRows(household.members, household.prefsByMember, r.id, r.lines, household.meUserId)
  const isBase = r.baseRecipe === true
  const cookProps = {
    batches,
    onBatchesChange: setBatches,
    yieldValue: r.yield,
    yieldUnit: isBase ? r.yieldUnit : null,
    system,
    onStart: () => navigate(cookRecipePath(r.id, batches)),
  }
  const photo = Boolean(r.imageUrl)
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
      <RecipeAbout description={r.description} source={r.source} />
      {isBase ? <BaseRecipeSection recipe={r} refreshKey={candidateTick} onChanged={refreshAll} /> : null}
      <div className="recipe-detail__layout">
        <div className="recipe-detail__aside">
          <Tile
            variant="media"
            className="recipe-detail__hero"
            data-photo={photo ? 'true' : 'false'}
            media={thumb}
          >
            <RecipeTags
              fitted
              lead={heroLeadChips(r, choices)}
              tags={r.tags}
              colourOf={colourOf}
              onOpen={(name) => navigate(recipesTagPath(name))}
            />
          </Tile>
          {hasRail ? <CookTile {...cookProps} /> : null}
          <RecipeMetrics
            yieldValue={r.yield}
            yieldUnit={r.yieldUnit}
            baseRecipe={isBase}
            stepCount={r.steps.length}
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
            />
          </Tile>
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
      {hasRail ? null : (
        <StickyActionBar label={recipeStrings.cook.barLabel}>
          <CookEntry {...cookProps} />
        </StickyActionBar>
      )}
    </section>
  )
}
