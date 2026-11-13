import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { BentoGrid, Button, PageHeader, Tile } from '../../../ui'
import { TakeOverDialog } from '../../recipes/components/TakeOverDialog'
import { AgentPromptStep } from '../components/AgentPromptStep'
import { BaseRecipeLineTile } from '../components/BaseRecipeLineTile'
import { ConfirmProblemTile } from '../components/ConfirmProblemTile'
import { ConfirmTile } from '../components/ConfirmTile'
import { ConvertBaseDialog } from '../components/ConvertBaseDialog'
import { CourseMatchTile } from '../components/CourseMatchTile'
import { ImageWarningsTile } from '../components/ImageWarningsTile'
import { ImportFollowUps } from '../components/ImportFollowUps'
import { ImportSource } from '../components/ImportSource'
import { IngredientMatchTile } from '../components/IngredientMatchTile'
import { ReadNote } from '../components/ReadNote'
import { ReadRecipeStep } from '../components/ReadRecipeStep'
import { RecipeConflictTile } from '../components/RecipeConflictTile'
import { ReviewPhotoChoice } from '../components/ReviewPhotoChoice'
import { TakeOverQuestion } from '../components/TakeOverQuestion'
import { UnitPromptTile } from '../components/UnitPromptTile'
import { ValidationErrorsTile } from '../components/ValidationErrorsTile'
import { useBaseRecipeLines, type UseBaseRecipeLines } from '../hooks/useBaseRecipeLines'
import { useImportCourses } from '../hooks/useImportCourses'
import { useImportReview } from '../hooks/useImportReview'
import { useReadAvailability } from '../hooks/useReadAvailability'
import { usePhotoReadEnd } from '../hooks/usePhotoReadEnd'
import { useRecipeRead } from '../hooks/useRecipeRead'
import { confirmNeedsAnswer } from '../lib/baseRecipeLines'
import { bulkLinkTargets, readNextItems } from '../lib/confirmFollowUps'
import { questionRows, splitProblems, usedByRecipes } from '../lib/courseRows'
import { canConfirm, openCount } from '../lib/reviewSummary'
import { importStrings as s } from '../strings'
import type { Plan } from '../types'
import { MAX_COURSES } from '../../../lib/courses'
import '../import.css'

/** BR-E: a Confirm that created or converted Base recipes, or asked to read one next, has follow-ups (ImportFollowUps). */
function hasFollowUps(result: NonNullable<ReturnType<typeof useImportReview>['result']>): boolean {
  return bulkLinkTargets(result).length > 0 || readNextItems(result).length > 0
}

/**
 * Route /recipes/import: four numbered steps. 1: Read a recipe (Recipe Assistant: page, text or photo). 2: the Agent Prompt.
 * 3: the Recipe File (FileDrop or pasted JSON). 4: the review (from useImportReview): a tile per open question (Ingredient match, Unit Conversion, Recipe conflict),
 * image warnings, and the sticky Confirm bar. Phase 'done' says what was imported. All state comes from useImportReview.
 */
export function ImportScreen(): ReactNode {
  const r = useImportReview()
  const courses = useImportCourses()
  const read = useRecipeRead({ onDone: r.adopt })
  // A photo read that reaches review finishes its photos here, not in the step: the step unmounts in the same commit that opens the review,
  // so the step's own effect would never see the end (hotfix 4.2). The step publishes its clearing in photosFinished.
  const photosFinished = useRef<(() => void) | undefined>(undefined)
  const finishPhotos = useCallback(() => photosFinished.current?.(), [])
  usePhotoReadEnd(read, finishPhotos)
  const availability = useReadAvailability()
  // BR-E: the Base recipe tiles and the convert dialog of the review.
  const baseLines = useBaseRecipeLines({ plan: r.plan, onAnswer: r.chooseBaseRecipeLine })
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

  // BR-E: "Read Béchamel now" lands on the Read step's heading, which says which Base recipe the read is for.
  const readNextFor = r.readNextFor
  useEffect(() => {
    if (readNextFor) readHeading.current?.focus({ preventScroll: true })
  }, [readNextFor])

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
        <>
          <Tile as="section" className="import-done">
            <p>{s.done(r.result?.recipes.length ?? 0)}</p>
            {(r.result?.coursesCreated ?? 0) > 0 ? <p>{s.courses.created(r.result?.coursesCreated ?? 0)}</p> : null}
            {(r.result?.coursesUnarchived ?? 0) > 0 ? <p>{s.courses.unarchived(r.result?.coursesUnarchived ?? 0)}</p> : null}
            <Link className="button" data-variant="primary" data-size="md" to="/recipes">
              {s.openRecipes}
            </Link>
            <Button variant="tertiary" onClick={() => void r.reset()}>
              {s.startOver}
            </Button>
          </Tile>
          {r.result && hasFollowUps(r.result) ? <ImportFollowUps result={r.result} onReadNext={(target) => void r.startReadNext(target)} /> : null}
        </>
      ) : (
        <>
          {r.phase === 'source' && r.readNextFor ? <p className="read-step__muted">{s.baseRecipes.readingFor(r.readNextFor.name)}</p> : null}
          {r.phase === 'source' ? <ReadRecipeStep read={read} availability={availability} headingRef={readHeading} photosFinished={photosFinished} /> : null}
          <AgentPromptStep step={r.phase === 'source' ? 2 : 1} />
          {r.phase === 'source' ? <ImportSource busy={r.busy} onSubmit={(text) => void r.open(text)} /> : null}
          <Tile as="section" className="import-review" overline={s.stepOverline(r.phase === 'source' ? 4 : 2)}>
            <h2 ref={reviewHeading} tabIndex={-1}>
              {s.stepThreeTitle}
            </h2>
            {r.phase === 'reviewing' && r.plan ? (
              <Reviewing plan={r.plan} stale={r.stale} screen={r} courses={courses} baseLines={baseLines} />
            ) : (
              <p className="import-review__empty">{s.reviewEmpty}</p>
            )}
          </Tile>
          {r.phase === 'reviewing' && r.plan ? (
            <ConfirmTile
              canConfirm={canConfirm(r.plan, r.busy)}
              busy={r.busy}
              open={openCount(r.plan)}
              needs={confirmNeedsAnswer(r.plan)}
              onConfirm={() => void r.confirm()}
            />
          ) : null}
        </>
      )}
      <ConvertBaseDialog
        state={baseLines.convert}
        canConfirm={baseLines.canConfirmConvert}
        onYield={baseLines.setYield}
        onYieldUnit={baseLines.setYieldUnit}
        onConfirm={baseLines.confirmConvert}
        onCancel={baseLines.cancelConvert}
      />
      <TakeOverDialog
        ask={r.takeOverPrompt?.ask ?? null}
        baseName={r.takeOverPrompt?.baseName ?? ''}
        onAnswer={(yes) => void r.answerTakeOverPrompt(yes)}
        onCancel={r.cancelTakeOverPrompt}
      />
    </section>
  )
}

interface ReviewingProps {
  plan: Plan
  stale: boolean
  screen: ReturnType<typeof useImportReview>
  courses: ReturnType<typeof useImportCourses>
  baseLines: UseBaseRecipeLines
}

function Reviewing({ plan, stale, screen, courses, baseLines }: ReviewingProps): ReactNode {
  // CRS E2: the too_many_courses Problem and a refused Course answer are inline danger Tiles beside the Course tiles; each follows its
  // state. The other Problems stay in the generic list. BR-E: a Problem on a Base recipe line is shown on that line's tile.
  const { courseLimit, others } = splitProblems(plan.problems)
  const names = questionRows(plan.courses)
  const forbidden = screen.courseForbidden
  const limited = courseLimit !== undefined
  const onTiles = new Set(plan.baseRecipeLines.map((l) => l.path))
  const genericProblems = others.filter((p) => !onTiles.has(p.path))
  // A take-over ask whose Base recipe has no line of its own (an exported Base recipe imported on its own) gets its own tile.
  const standaloneAsks = plan.takeOvers.filter((a) => !onTiles.has(a.path))
  return (
    <>
      <ConfirmProblemTile problem={screen.confirmProblem} />
      {screen.readNote ? <ReadNote note={screen.readNote} /> : null}
      {stale ? (
        <Tile variant="status" status="danger" role="alert" as="section">
          <p>{s.stale}</p>
          <Button variant="tertiary" onClick={() => void screen.reset()}>
            {s.startOver}
          </Button>
        </Tile>
      ) : null}
      {genericProblems.length > 0 ? (
        <Tile variant="status" status="spoil" as="section">
          <h3>{s.errorsTitle}</h3>
          <ul className="import-list">
            {genericProblems.map((p, i) => (
              <li key={`${p.path}-${i}`}>
                <code>{p.path}</code> {p.message}
              </li>
            ))}
          </ul>
        </Tile>
      ) : null}
      <section aria-label={s.ingredientsTitle}>
        <BentoGrid min="card" label={s.ingredientsTitle}>
          {plan.ingredients.map((m) => (
            <IngredientMatchTile key={m.key} match={m} onUseExisting={(id) => screen.chooseExisting(m.key, id)} onCreate={(opts) => screen.chooseCreate(m.key, opts)} />
          ))}
        </BentoGrid>
      </section>
      {plan.baseRecipeLines.length > 0 || standaloneAsks.length > 0 ? (
        <section aria-label={s.baseRecipes.title}>
        <BentoGrid min="card" label={s.baseRecipes.title}>
          {baseLines.rows.map((row) => (
            <BaseRecipeLineTile
              key={row.path}
              row={row}
              ask={baseLines.askFor(row.path)}
              problems={plan.problems}
              warnings={plan.warnings}
              onAnswer={(answer) => baseLines.answer(row.path, answer)}
              onConvert={(recipe) => void baseLines.startConvert(row.path, recipe)}
              onTakeOver={(yes) => screen.chooseTakeOver(row.path, yes)}
            />
          ))}
          {standaloneAsks.map((ask) => (
            <Tile as="section" key={ask.path} aria-label={ask.name} className="base-line-tile">
              <TakeOverQuestion ask={ask} onTakeOver={(yes) => screen.chooseTakeOver(ask.path, yes)} />
            </Tile>
          ))}
        </BentoGrid>
        </section>
      ) : null}
      {plan.unitPrompts.length > 0 ? (
        <BentoGrid min="card" label={s.unitsTitle}>
          {plan.unitPrompts.map((p) => (
            <UnitPromptTile key={`${p.key}-${p.unit}`} prompt={p} onAnswer={(toBase) => screen.answerConversion(p.key, p.unit, toBase)} />
          ))}
        </BentoGrid>
      ) : null}
      {names.length > 0 || limited || forbidden ? (
        <BentoGrid min="card" label={s.courses.title}>
          {limited ? (
            <Tile variant="status" status="danger" role="alert" as="section">
              <p>{s.courses.tooMany(MAX_COURSES)}</p>
            </Tile>
          ) : null}
          {forbidden ? (
            <Tile variant="status" status="danger" role="alert" as="section">
              <p>{s.courses.forbidden}</p>
            </Tile>
          ) : null}
          {names.map((m) => (
            <CourseMatchTile
              key={m.key}
              match={m}
              usedBy={usedByRecipes(m.usedBy, plan.recipes)}
              courses={courses.courses}
              isAdmin={courses.isAdmin}
              onUse={(courseId) => screen.chooseCourseUse(m.key, courseId)}
              onSkip={() => screen.chooseCourseSkip(m.key)}
              onAdd={() => screen.chooseCourseAdd(m.key)}
              onUnarchive={() => screen.chooseCourseUnarchive(m.key)}
            />
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
    </>
  )
}
