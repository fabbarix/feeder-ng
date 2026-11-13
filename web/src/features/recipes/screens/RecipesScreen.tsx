import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BentoGrid, Button, EmptyState, ErrorState, ListPage, PageHeader, SearchField, Skeleton } from '../../../ui'
import { useCourses } from '../../../lib/courses/useCourses'
import { CourseFilter } from '../components/CourseFilter'
import { RecipesOverflowMenu } from '../components/RecipesOverflowMenu'
import { RecipeSortSelect } from '../components/RecipeSortSelect'
import { RecipeTile } from '../components/RecipeTile'
import { TagChips } from '../components/TagChips'
import { useRecipeSort } from '../hooks/useRecipeSort'
import { useRecipeTags } from '../hooks/useRecipeTags'
import { useRecipes } from '../hooks/useRecipes'
import { lastCookedLabel, localToday } from '../lib/lastCooked'
import { courseNamesOf, showsWholeMeal } from '../lib/recipeCourses'
import { recipeStrings } from '../strings'
import type { RecipeFilter } from '../types'
import '../recipes.css'

/**
 * Route /recipes: the header ("New Recipe" and the More overflow with Import, Export, Copy Agent Prompt and Show
 * archived), the search, one row of Tag filters, then the Recipes as media Tiles. Opening a Tile goes to /recipes/:id.
 */
export function RecipesScreen(): ReactNode {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  // TG-RW: the Tag filter lives in the URL (/recipes?tag=<name>), so the detail's Tag links open the list filtered.
  const tag = searchParams.get('tag') ?? ''
  const setTag = (name: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (name) next.set('tag', name)
        else next.delete('tag')
        return next
      },
      { replace: true },
    )
  const { known, colourOf } = useRecipeTags()
  const [showArchived, setShowArchived] = useState(false)
  const [course, setCourse] = useState<number | null>(null)
  const { choices } = useCourses()
  const { sort, setSort } = useRecipeSort()
  const filter: RecipeFilter = {
    q: q.trim() || undefined,
    tag: tag || undefined,
    course: course ?? undefined,
    archived: showArchived ? 'all' : 'no',
    sort,
  }
  const list = useRecipes(filter)
  const today = localToday()

  let body: ReactNode
  if (list.error) body = <ErrorState message={recipeStrings.listError} onRetry={list.refetch} />
  else if (list.isLoading) body = <Skeleton variant="tile" count={4} />
  else if (list.recipes.length > 0)
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
            lastCooked={lastCookedLabel(r.lastCookedOn, today)}
          />
        ))}
      </BentoGrid>
    )
  else if (list.isEmpty)
    body = (
      <EmptyState
        icon="recipes"
        title={recipeStrings.empty}
        action={
          <Button icon="add" onClick={() => navigate('/recipes/new')}>
            {recipeStrings.newRecipe}
          </Button>
        }
      />
    )
  else body = <EmptyState icon="search" title={recipeStrings.noMatch} />

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
      search={<SearchField label={recipeStrings.search} value={q} onChange={setQ} />}
      filters={
        <>
          <TagChips tags={known} selected={tag} onSelect={setTag} colourOf={colourOf} />
          <CourseFilter courses={choices} selected={course} onSelect={setCourse} />
          <div className="recipes-sort">
            <RecipeSortSelect value={sort} onChange={setSort} />
          </div>
        </>
      }
    >
      {body}
    </ListPage>
  )
}
