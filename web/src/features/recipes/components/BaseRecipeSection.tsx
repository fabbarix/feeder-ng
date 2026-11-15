import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, TextLink, Tile } from '../../../ui'
import { useBaseLinkCandidates } from '../hooks/useBaseLinkCandidates'
import { useBaseRecipeStock } from '../hooks/useBaseRecipeStock'
import { recipeStrings } from '../strings'
import type { Recipe } from '../types'
import { BaseRecipeBadge } from './BaseRecipeBadge'
import { LinkCandidatesSheet } from './LinkCandidatesSheet'

/**
 * BR-D and RX-06: a Base recipe's own facts on its detail: the badge, the Pantry's Stock of it, the heading "Used in" (always) with the
 * Recipes that call for it as links or the sentence that nothing does yet, and the candidates row that opens the bulk link list while any
 * plain line of that name is left. The Yield is the metric strip's, not repeated here. A child component, so a plannable Recipe never asks
 * for candidates or Stock.
 */
export function BaseRecipeSection({ recipe: r, refreshKey, onChanged }: { recipe: Recipe; refreshKey: number; onChanged: () => void }): ReactNode {
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
          <BaseRecipeBadge />
        </p>
        {stock.line ? <p>{stock.href ? <TextLink to={stock.href}>{stock.line}</TextLink> : stock.line}</p> : null}
        <h2 className="recipe-base__title">{recipeStrings.usedIn.title}</h2>
        {used.length === 0 ? (
          <p className="recipe-base__none">{recipeStrings.usedIn.none}</p>
        ) : (
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
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
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
