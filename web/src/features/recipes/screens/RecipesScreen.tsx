import { useId, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActiveFilterChips, BentoGrid, Button, EmptyState, ErrorState, FiltersButton, ListPage, LoadState, PageHeader, SearchField, Skeleton } from '../../../ui'
import { useCourses } from '../../../lib/courses/useCourses'
import { RecipeFiltersPanel } from '../components/RecipeFiltersPanel'
import { RecipesOverflowMenu } from '../components/RecipesOverflowMenu'
import { RecipeSortSelect } from '../components/RecipeSortSelect'
import { RecipeTile } from '../components/RecipeTile'
import { RecipeKindControl } from '../components/RecipeKindControl'
import { useRecipeSort } from '../hooks/useRecipeSort'
import { useRecipeFilters } from '../hooks/useRecipeFilters'
import { useRecipeTags } from '../hooks/useRecipeTags'
import { useRecipes } from '../hooks/useRecipes'
import { lastCookedLabel, localToday } from '../lib/lastCooked'
import { courseNamesOf, showsWholeMeal } from '../lib/recipeCourses'
import { recipeStrings } from '../strings'
import type { RecipeFilter } from '../types'
import '../recipes-list.css'

/**
 * Route /recipes: the header ("New Recipe" and the More overflow with Import, Export, Copy Agent Prompt and Show
 * archived), two one-line rows (Search and Filters; Kind and Sort) and the active filter chips, then the Recipes as media
 * Tiles. Course and Tags are chosen in the Filters panel. Opening a Tile goes to /recipes/:id.
 */
export function RecipesScreen(): ReactNode {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const { known, colourOf } = useRecipeTags()
  const [showArchived, setShowArchived] = useState(false)
  const { choices } = useCourses()
  const { sort, setSort } = useRecipeSort()
  // The filters live in the URL (?kind, ?course, ?tag once per Tag): a link or the back button brings them back.
  const filters = useRecipeFilters(choices, known, colourOf)
  const bases = filters.kind === 'base'
  const [panelOpen, setPanelOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const filter: RecipeFilter = {
    q: q.trim() || undefined,
    tags: filters.tags.length ? filters.tags : undefined,
    course: bases ? undefined : (filters.course ?? undefined),
    archived: showArchived ? 'all' : 'no',
    sort: bases ? undefined : sort,
    kind: filters.kind,
  }
  const list = useRecipes(filter)
  const today = localToday()

  const showAll = () => {
    setQ('')
    setShowArchived(false)
    filters.clear()
  }

  // B9-20 (RES-02): one state model; "unknown is not empty". The hook reads the same filter; until it catches up with a
  // cleared search, a filtered-empty answer with nothing filtered any more is simply empty.
  const anyFilter = Boolean(filter.q || filter.tags || filter.course !== undefined || showArchived)
  const state = list.state === 'filteredEmpty' && !anyFilter ? 'empty' : list.state
  let body: ReactNode
  switch (state) {
    case 'loading':
      body = <Skeleton variant="tile" count={4} label={recipeStrings.loading} />
      break
    case 'offlineUnknown':
      body = <LoadState title={recipeStrings.offlineUnknownTitle} text={recipeStrings.offlineUnknownText} />
      break
    case 'failed':
      body = <ErrorState message={recipeStrings.listError} onRetry={list.refetch} />
      break
    case 'empty':
      body = bases ? (
        <EmptyState icon="recipes" title={recipeStrings.baseRecipe.emptyBases} />
      ) : (
        <EmptyState
          icon="recipes"
          title={recipeStrings.empty}
          description={recipeStrings.emptyText}
          action={
            <>
              <Button onClick={() => navigate('/recipes/new')}>{recipeStrings.newRecipe}</Button>
              <Button variant="secondary" onClick={() => navigate('/recipes/import')}>
                {recipeStrings.importRecipes}
              </Button>
            </>
          }
        />
      )
      break
    case 'filteredEmpty':
      body = (
        <EmptyState
          icon="search"
          title={filter.q ? recipeStrings.noMatchFor(filter.q) : recipeStrings.noMatchFilters}
          description={recipeStrings.noMatchText}
          action={
            <Button variant="secondary" onClick={showAll}>
              {recipeStrings.showAll}
            </Button>
          }
        />
      )
      break
    default:
      body = (
        <BentoGrid min="card" label={recipeStrings.title}>
          {list.recipes.map((r) => (
            <RecipeTile
              key={r.id}
              recipe={r}
              onOpen={(id) => navigate(`/recipes/${id}`)}
              colourOf={colourOf}
              courseNames={courseNamesOf(r.courseIds, choices)}
              wholeMeal={r.wholeMeal && showsWholeMeal(r.courseIds, choices)}
              lastCooked={r.baseRecipe ? undefined : lastCookedLabel(r.lastCookedOn, today)}
            />
          ))}
        </BentoGrid>
      )
  }

  return (
    <ListPage
      className="recipes-screen"
      header={
        <PageHeader
          title={recipeStrings.title}
          actions={
            <>
              <Button size="sm" icon="add" onClick={() => navigate('/recipes/new')}>
                {recipeStrings.newRecipe}
              </Button>
              <RecipesOverflowMenu showArchived={showArchived} onShowArchivedChange={setShowArchived} />
            </>
          }
        />
      }
      search={
        <>
          <div className="filter-bar__row filter-bar__search-row">
            <SearchField label={recipeStrings.search} value={q} onChange={setQ} />
            <FiltersButton
              ref={anchor}
              count={filters.count}
              expanded={panelOpen}
              controls={panelOpen ? panelId : undefined}
              onClick={() => setPanelOpen((open) => !open)}
            />
          </div>
          <RecipeFiltersPanel
            id={panelId}
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            anchorRef={anchor}
            bases={bases}
            courses={choices}
            course={filters.course}
            onCourse={filters.setCourse}
            known={known}
            tags={filters.tags}
            colourOf={colourOf}
            onToggleTag={filters.toggleTag}
            count={filters.count}
            onClear={filters.clear}
          />
        </>
      }
      filters={
        <>
          <div className="filter-bar__row filter-bar__view-row">
            <RecipeKindControl value={filters.kind} onChange={filters.setKind} />
            {bases ? null : (
              <div className="filter-bar__sort">
                <RecipeSortSelect value={sort} onChange={setSort} />
              </div>
            )}
          </div>
          <ActiveFilterChips chips={filters.chips} onRemove={filters.remove} onMore={() => setPanelOpen(true)} fallbackFocus={anchor} />
        </>
      }
    >
      {body}
    </ListPage>
  )
}
