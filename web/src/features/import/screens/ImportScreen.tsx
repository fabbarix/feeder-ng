import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { BentoGrid, Button, PageHeader, Tile } from '../../../ui'
import { AgentPromptStep } from '../components/AgentPromptStep'
import { ConfirmTile } from '../components/ConfirmTile'
import { ImageWarningsTile } from '../components/ImageWarningsTile'
import { ImportSource } from '../components/ImportSource'
import { IngredientMatchTile } from '../components/IngredientMatchTile'
import { ReadNote } from '../components/ReadNote'
import { ReadRecipeStep } from '../components/ReadRecipeStep'
import { RecipeConflictTile } from '../components/RecipeConflictTile'
import { ReviewPhotoChoice } from '../components/ReviewPhotoChoice'
import { UnitPromptTile } from '../components/UnitPromptTile'
import { ValidationErrorsTile } from '../components/ValidationErrorsTile'
import { useImportReview } from '../hooks/useImportReview'
import { useReadAvailability } from '../hooks/useReadAvailability'
import { useRecipeRead } from '../hooks/useRecipeRead'
import { canConfirm, openCount } from '../lib/reviewSummary'
import { importStrings as s } from '../strings'
import type { Plan } from '../types'
import '../import.css'

/**
 * Route /recipes/import: four numbered steps. 1: Read a recipe (Recipe Assistant: page, text or photo). 2: the Agent Prompt.
 * 3: the Recipe File (FileDrop or pasted JSON). 4: the review (from useImportReview): a tile per open question (Ingredient match, Unit Conversion, Recipe conflict),
 * image warnings, and the sticky Confirm bar. Phase 'done' says what was imported. All state comes from useImportReview.
 */
export function ImportScreen(): ReactNode {
  const r = useImportReview()
  const read = useRecipeRead({ onDone: r.adopt })
  const availability = useReadAvailability()
  const readHeading = useRef<HTMLHeadingElement>(null)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const { hash } = useLocation()

  // The Recipes More sheet links to #read: land on the step's heading.
  useEffect(() => {
    if (hash !== '#read') return
    const heading = readHeading.current
    heading?.scrollIntoView?.({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }, [hash])

  // A finished read opens the review below the fold on a phone: move focus there so the result is not missed. A file does not.
  const fromRead = r.readNote !== undefined
  const reviewing = r.phase === 'reviewing'
  const wasReviewing = useRef(false)
  useEffect(() => {
    if (reviewing && !wasReviewing.current && fromRead) {
      reviewHeading.current?.scrollIntoView?.({ block: 'start' })
      reviewHeading.current?.focus({ preventScroll: true })
    }
    wasReviewing.current = reviewing
  }, [reviewing, fromRead])

  // The Household's reads left changed when a read started or ended.
  const busy = read.busy
  const wasBusy = useRef(busy)
  const { retry: refreshStatus } = availability
  useEffect(() => {
    if (wasBusy.current !== busy) refreshStatus()
    wasBusy.current = busy
  }, [busy, refreshStatus])

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
          {r.phase === 'source' ? <ReadRecipeStep read={read} availability={availability} headingRef={readHeading} /> : null}
          <AgentPromptStep />
          {r.phase === 'source' ? <ImportSource busy={r.busy} onSubmit={(text) => void r.open(text)} /> : null}
          <Tile as="section" className="import-review" overline={s.stepOverline(4)}>
            <h2 ref={reviewHeading} tabIndex={-1}>
              {s.stepThreeTitle}
            </h2>
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
      {screen.readNote ? <ReadNote note={screen.readNote} /> : null}
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
      {screen.reviewId ? (
        <ReviewPhotoChoice
          importId={screen.reviewId}
          photos={screen.photos}
          recipes={screen.photoRecipes}
          choice={screen.photoChoice}
          onToggle={screen.setPhotoEnabled}
          onPhoto={screen.choosePhoto}
          onRecipe={screen.choosePhotoRecipe}
        />
      ) : null}
      <ConfirmTile canConfirm={canConfirm(plan, busy)} busy={busy} open={openCount(plan)} onConfirm={() => void screen.confirm()} />
    </>
  )
}
