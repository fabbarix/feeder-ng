import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { BentoGrid, Button, PageHeader, Tile } from '../../../ui'
import { AgentPromptStep } from '../components/AgentPromptStep'
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
import '../import.css'

/**
 * Route /recipes/import: three numbered steps. 1: the Agent Prompt. 2: the Recipe File (FileDrop or pasted JSON).
 * 3: the review (from useImportReview): a tile per open question (Ingredient match, Unit Conversion, Recipe conflict),
 * image warnings, and the sticky Confirm bar. Phase 'done' says what was imported. All state comes from useImportReview.
 */
export function ImportScreen(): ReactNode {
  const r = useImportReview()
  return (
    <section className="import-screen">
      <PageHeader title={s.importTitle} breadcrumbs={useBreadcrumbs()} />
      {r.error ? <ValidationErrorsTile error={r.error} /> : null}
      {r.phase === 'done' ? (
        <Tile as="section" className="import-done">
          <p>{s.done(r.result?.recipes.length ?? 0)}</p>
          <Link className="import-link-button" to="/recipes">
            {s.openRecipes}
          </Link>
          <Button variant="tertiary" onClick={() => void r.reset()}>
            {s.startOver}
          </Button>
        </Tile>
      ) : (
        <>
          <AgentPromptStep />
          {r.phase === 'source' ? <ImportSource busy={r.busy} onSubmit={(text) => void r.open(text)} /> : null}
          <Tile as="section" className="import-review" overline={s.stepOverline(3)}>
            <h2>{s.stepThreeTitle}</h2>
            {r.phase === 'reviewing' && r.plan ? (
              <Reviewing plan={r.plan} busy={r.busy} stale={r.stale} screen={r} />
            ) : (
              <p className="import-review__empty">{s.reviewEmpty}</p>
            )}
          </Tile>
        </>
      )}
    </section>
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
        <Tile variant="status" status="danger" role="alert" as="section">
          <p>{s.stale}</p>
          <Button variant="tertiary" onClick={() => void screen.reset()}>
            {s.startOver}
          </Button>
        </Tile>
      ) : null}
      {plan.problems.length > 0 ? (
        <Tile variant="status" status="spoil" as="section">
          <h3>{s.errorsTitle}</h3>
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
          <IngredientMatchTile key={m.key} match={m} onUseExisting={(id) => screen.chooseExisting(m.key, id)} onCreate={(opts) => screen.chooseCreate(m.key, opts)} />
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
