import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BentoGrid, Button, Tile } from '../../../ui'
import { ConfirmTile } from '../components/ConfirmTile'
import { ImageWarningsTile } from '../components/ImageWarningsTile'
import { ImportSource } from '../components/ImportSource'
import { IngredientMatchTile } from '../components/IngredientMatchTile'
import { RecipeConflictTile } from '../components/RecipeConflictTile'
import { UnitPromptTile } from '../components/UnitPromptTile'
import { ValidationErrorsTile } from '../components/ValidationErrorsTile'
import { useImportReview } from '../hooks/useImportReview'
import { canConfirm, openCount } from '../lib/reviewSummary'
import { importStrings as s } from '../strings'
import type { Plan } from '../types'

/**
 * Route /recipes/import. Phase 'source': ImportSource (+ ValidationErrorsTile when opening failed).
 * Phase 'reviewing': a BentoGrid of step tiles from lib/reviewSummary.reviewSteps: problems (list of Problem paths), IngredientMatchTile per
 * Ingredient, UnitPromptTile per prompt, RecipeConflictTile per conflicting Recipe, ImageWarningsTile, then ConfirmTile.
 * Phase 'done': importStrings.done(n), links "Open Recipes" (/recipes) and "Start over". `stale` shows importStrings.stale with "Start over".
 * All state comes from useImportReview.
 */
export function ImportScreen(): ReactNode {
  const r = useImportReview()
  return (
    <main>
      <h1>{s.importTitle}</h1>
      {r.error ? <ValidationErrorsTile error={r.error} /> : null}
      {r.phase === 'source' ? <ImportSource busy={r.busy} onSubmit={(text) => void r.open(text)} /> : null}
      {r.phase === 'reviewing' && r.plan ? <Reviewing plan={r.plan} busy={r.busy} stale={r.stale} screen={r} /> : null}
      {r.phase === 'done' ? (
        <Tile size="wide" as="section">
          <p>{s.done(r.result?.recipes.length ?? 0)}</p>
          <Link className="button" data-variant="primary" to="/recipes">{s.openRecipes}</Link>
          <Button variant="ghost" onClick={() => void r.reset()}>{s.startOver}</Button>
        </Tile>
      ) : null}
    </main>
  )
}

interface ReviewingProps {
  plan: Plan
  busy: boolean
  stale: boolean
  screen: ReturnType<typeof useImportReview>
}

function Reviewing({ plan, busy, stale, screen }: ReviewingProps): ReactNode {
  return (
    <>
      {stale ? (
        <Tile tone="spoil" role="alert" as="section">
          <p>{s.stale}</p>
          <Button variant="ghost" onClick={() => void screen.reset()}>{s.startOver}</Button>
        </Tile>
      ) : null}
      {plan.problems.length > 0 ? (
        <Tile tone="spoil" as="section">
          <h2>{s.errorsTitle}</h2>
          <ul>
            {plan.problems.map((p, i) => (
              <li key={`${p.path}-${i}`}>
                <code>{p.path}</code> {p.message}
              </li>
            ))}
          </ul>
        </Tile>
      ) : null}
      <BentoGrid columns={2} label={s.ingredientsTitle}>
        {plan.ingredients.map((m) => (
          <IngredientMatchTile
            key={m.key}
            match={m}
            onUseExisting={(id) => screen.chooseExisting(m.key, id)}
            onCreate={(opts) => screen.chooseCreate(m.key, opts)}
          />
        ))}
      </BentoGrid>
      {plan.unitPrompts.length > 0 ? (
        <BentoGrid columns={2} label={s.unitsTitle}>
          {plan.unitPrompts.map((p) => (
            <UnitPromptTile key={`${p.key}-${p.unit}`} prompt={p} onAnswer={(toBase) => screen.answerConversion(p.key, p.unit, toBase)} />
          ))}
        </BentoGrid>
      ) : null}
      {plan.recipes
        .filter((r) => r.status === 'conflict')
        .map((r) => (
          <RecipeConflictTile key={r.index} recipe={r} onChoose={(action) => screen.chooseRecipeAction(r.index, action)} />
        ))}
      <ImageWarningsTile warnings={plan.warnings.filter((w) => w.code === 'image_failed')} />
      <ConfirmTile canConfirm={canConfirm(plan, busy)} busy={busy} open={openCount(plan)} onConfirm={() => void screen.confirm()} />
    </>
  )
}
