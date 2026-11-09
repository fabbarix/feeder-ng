import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BentoGrid, Button, Chip, EmptyState } from '../../../ui'
import { RecipeFileActions } from '../../import/components/RecipeFileActions'
import { RecipeTile } from '../components/RecipeTile'
import { TagChips } from '../components/TagChips'
import { useRecipes } from '../hooks/useRecipes'
import { recipeStrings } from '../strings'
import type { RecipeFilter } from '../types'

/**
 * Route /recipes: search, Tag filter, archived toggle, "New Recipe" and the Recipe File actions (Import,
 * Export, Copy Agent Prompt), then the Recipes as Tiles. Opening a Tile goes to /recipes/:id.
 */
export function RecipesScreen(): ReactNode {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const filter: RecipeFilter = { q: q.trim() || undefined, tag: tag || undefined, archived: showArchived ? 'all' : 'no' }
  const list = useRecipes(filter)

  let body: ReactNode
  if (list.error) body = <p role="alert">{recipeStrings.listError}</p>
  else if (list.isLoading) body = <p>{recipeStrings.loading}</p>
  else if (list.recipes.length > 0)
    body = (
      <BentoGrid columns={2} label={recipeStrings.title}>
        {list.recipes.map((r) => (
          <RecipeTile key={r.id} recipe={r} onOpen={(id) => navigate(`/recipes/${id}`)} />
        ))}
      </BentoGrid>
    )
  else if (list.isEmpty)
    body = (
      <EmptyState
        title={recipeStrings.title}
        description={recipeStrings.empty}
        action={<Button onClick={() => navigate('/recipes/new')}>{recipeStrings.newRecipe}</Button>}
      />
    )
  else body = <p>{recipeStrings.noMatch}</p>

  return (
    <section>
      <h1>{recipeStrings.title}</h1>
      <div>
        <label>
          {recipeStrings.search}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Chip selected={showArchived} onClick={() => setShowArchived((v) => !v)}>
          {recipeStrings.showArchived}
        </Chip>
        <Button onClick={() => navigate('/recipes/new')}>{recipeStrings.newRecipe}</Button>
        <RecipeFileActions />
      </div>
      <TagChips tags={list.tags} selected={tag} onSelect={setTag} />
      {body}
    </section>
  )
}
