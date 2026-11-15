import { useCallback, useEffect, useId, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { BentoGrid, Button, DetailList, DetailRow, PageHeader, Tile } from '../../../ui'
import { TakeOverDialog } from '../../recipes/components/TakeOverDialog'
import { BaseRecipeLineTile } from '../components/BaseRecipeLineTile'
import { ConfirmProblemTile } from '../components/ConfirmProblemTile'
import { ConvertBaseDialog } from '../components/ConvertBaseDialog'
import { CourseMatchTile } from '../components/CourseMatchTile'
import { ImageWarningsTile } from '../components/ImageWarningsTile'
import { ImportBar } from '../components/ImportBar'
import { ImportFollowUps } from '../components/ImportFollowUps'
import { ImportResult } from '../components/ImportResult'
import { ImportReviewNotice } from '../components/ImportReviewNotice'
import { IngredientMatchList } from '../components/IngredientMatchList'
import { ReadNote } from '../components/ReadNote'
import { ReadRecipeStep } from '../components/ReadRecipeStep'
import { RecipeFileTile } from '../components/RecipeFileTile'
import { RecipePreviewList } from '../components/RecipePreviewList'
import { ReviewPhotoChoice } from '../components/ReviewPhotoChoice'
import { StartOverButton } from '../components/StartOverButton'
import { TakeOverQuestion } from '../components/TakeOverQuestion'
import { ValidationErrorsTile } from '../components/ValidationErrorsTile'
import { useBaseRecipeLines, type UseBaseRecipeLines } from '../hooks/useBaseRecipeLines'
import { useImportCourses } from '../hooks/useImportCourses'
import { useImportReview } from '../hooks/useImportReview'
import { useQuestionJump } from '../hooks/useQuestionJump'
import { useReadAvailability } from '../hooks/useReadAvailability'
import { usePhotoReadEnd } from '../hooks/usePhotoReadEnd'
import { useRecipeRead } from '../hooks/useRecipeRead'
import { genericProblems, standaloneAsks } from '../lib/baseRecipeLines'
import { hasFollowUps } from '../lib/confirmFollowUps'
import { questionRows, splitProblems, usedByRecipes } from '../lib/courseRows'
import { answersGiven, courseRowId, openQuestions, reviewCounts, takeOverRowId } from '../lib/reviewSummary'
import { importStrings as s } from '../strings'
import type { Plan } from '../types'
import { MAX_COURSES } from '../../../lib/courses'
import '../import.css'

/**
 * Route /recipes/import (RX-01, RX-11, RX-12). Before a review: two paths, "Read a recipe" (the Recipe Assistant) and "Import a Recipe File",
 * the File first when the Recipe Assistant is unavailable. While reviewing: the notice, the Recipes, the Base recipe lines and Courses, the
 * Ingredients, the image warnings and the photo choice, with the sticky "Import actions" bar; "Start over" in the header. When done: the
 * result, naming each Recipe. All state comes from useImportReview; the questions and their order from lib/reviewSummary.
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
  const readNoteId = useId()
  const readHeading = useRef<HTMLHeadingElement>(null)
  const reviewStart = useRef<HTMLDivElement>(null)
  const { hash } = useLocation()

  // The Recipes More sheet links to #read: land on the Read a recipe heading.
  useEffect(() => {
    if (hash !== '#read') return
    const heading = readHeading.current
    heading?.scrollIntoView?.({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }, [hash])

  // BR-E: "Read Béchamel now" lands on the Read a recipe heading, which says which Base recipe the read is for.
  const readNextFor = r.readNextFor
  useEffect(() => {
    if (readNextFor) readHeading.current?.focus({ preventScroll: true })
  }, [readNextFor])

  // A finished read opens the review where the read was: move focus to the review's start so the result is not missed. A file does not.
  const fromRead = r.readNote !== undefined
  const reviewing = r.phase === 'reviewing'
  const wasReviewing = useRef(false)
  useEffect(() => {
    if (reviewing && !wasReviewing.current && fromRead) {
      reviewStart.current?.scrollIntoView?.({ block: 'start' })
      reviewStart.current?.focus({ preventScroll: true })
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

  const readFirst = availability.loading || availability.enabled
  const readTile =
    r.phase === 'source' ? (
      <ReadRecipeStep
        key="read"
        read={read}
        availability={availability}
        headingRef={readHeading}
        headingDescribedBy={r.readNextFor ? readNoteId : undefined}
        photosFinished={photosFinished}
      />
    ) : null
  const fileTile = <RecipeFileTile key="file" busy={r.busy} onSubmit={(text) => void r.open(text)} />

  return (
    <section className="import-screen">
      <PageHeader
        title={s.importTitle}
        breadcrumbs={useBreadcrumbs()}
        actions={reviewing ? <StartOverButton answered={answersGiven(r.decisions)} onStartOver={() => void r.reset()} /> : undefined}
      />
      {r.error ? <ValidationErrorsTile error={r.error} /> : null}
      {r.phase === 'done' && r.result ? (
        <>
          <ImportResult result={r.result} plan={r.plan ?? emptyPlan} onImportMore={() => void r.reset()} />
          {hasFollowUps(r.result) ? <ImportFollowUps result={r.result} onReadNext={(target) => void r.startReadNext(target)} /> : null}
        </>
      ) : null}
      {r.phase === 'source' ? (
        <>
          {r.readNextFor ? (
            <p id={readNoteId} className="read-step__muted">
              {s.baseRecipes.readingFor(r.readNextFor.name)}
            </p>
          ) : null}
          <div className="import-start-frame">
            <div className="import-start">{readFirst ? [readTile, fileTile] : [fileTile, readTile]}</div>
          </div>
        </>
      ) : null}
      {reviewing && r.plan ? <Reviewing plan={r.plan} stale={r.stale} screen={r} courses={courses} baseLines={baseLines} startRef={reviewStart} /> : null}
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

const emptyPlan: Plan = { ingredients: [], unitPrompts: [], recipes: [], courses: [], baseRecipeLines: [], takeOvers: [], problems: [], warnings: [], ready: false }

interface ReviewingProps {
  plan: Plan
  stale: boolean
  screen: ReturnType<typeof useImportReview>
  courses: ReturnType<typeof useImportCourses>
  baseLines: UseBaseRecipeLines
  /** The start of the review, which takes focus after a read. */
  startRef: RefObject<HTMLDivElement | null>
}

function Reviewing({ plan, stale, screen, courses, baseLines, startRef }: ReviewingProps): ReactNode {
  const root = useRef<HTMLDivElement>(null)
  const questions = useMemo(() => openQuestions(plan), [plan])
  const jump = useQuestionJump(root, questions)
  const counts = reviewCounts(plan)
  // CRS E2: the too_many_courses Problem and a refused Course answer sit beside the Course tiles; the other Problems stay in the generic list.
  // BR-E: a Problem on a Base recipe line is shown on that line's tile.
  const { courseLimit, others } = splitProblems(plan.problems)
  const problems = genericProblems(plan, others)
  const names = questionRows(plan.courses)
  const forbidden = screen.courseForbidden
  const limited = courseLimit !== undefined
  // A take-over ask whose Base recipe has no line of its own (an exported Base recipe imported on its own) gets its own tile.
  const asks = standaloneAsks(plan)
  return (
    <div ref={root} className="import-review">
      <div ref={startRef} tabIndex={-1} className="import-review__start">
        <ImportReviewNotice
          recipes={counts.recipes}
          ingredients={counts.ingredients}
          questions={questions.length}
          allSkipped={plan.recipes.length > 0 && counts.recipes === 0}
          onGoToFirst={jump.goToFirst}
        />
      </div>
      <ConfirmProblemTile problem={screen.confirmProblem} />
      {stale ? (
        <Tile variant="status" status="warn" role="alert" as="section">
          <p>{s.stale}</p>
          <Button variant="secondary" onClick={() => void screen.reset()}>
            {s.startOver}
          </Button>
        </Tile>
      ) : null}
      {problems.length > 0 ? (
        <Tile variant="status" status="warn" as="section">
          <h2>{s.errorsTitle}</h2>
          <DetailList tone="warn">
            {problems.map((p, i) => (
              <DetailRow key={`${p.path}-${i}`} label={<code>{p.path}</code>} detail={p.message} />
            ))}
          </DetailList>
        </Tile>
      ) : null}
      {screen.readNote ? <ReadNote note={screen.readNote} /> : null}
      <RecipePreviewList recipes={plan.recipes} onChoose={screen.chooseRecipeAction} />
      {plan.baseRecipeLines.length > 0 || asks.length > 0 ? (
        <section aria-label={s.baseRecipes.title}>
          <BentoGrid min="card">
            {baseLines.rows.map((row) => (
              <BaseRecipeLineTile
                key={row.path}
                question={row.path}
                row={row}
                ask={baseLines.askFor(row.path)}
                problems={plan.problems}
                warnings={plan.warnings}
                onAnswer={(answer) => baseLines.answer(row.path, answer)}
                onConvert={(recipe) => void baseLines.startConvert(row.path, recipe)}
                onTakeOver={(yes) => screen.chooseTakeOver(row.path, yes)}
              />
            ))}
            {asks.map((ask) => (
              <TakeOverQuestion key={ask.path} question={takeOverRowId(ask.path)} ask={ask} onTakeOver={(yes) => screen.chooseTakeOver(ask.path, yes)} />
            ))}
          </BentoGrid>
        </section>
      ) : null}
      {names.length > 0 || limited || forbidden ? (
        <BentoGrid min="card" label={s.courses.title}>
          {limited ? (
            <Tile variant="status" status="warn" role="alert" as="section">
              <p>{s.courses.tooMany(MAX_COURSES)}</p>
            </Tile>
          ) : null}
          {forbidden ? (
            <Tile variant="status" status="warn" role="alert" as="section">
              <p>{s.courses.forbidden}</p>
            </Tile>
          ) : null}
          {names.map((m) => (
            <CourseMatchTile
              key={m.key}
              question={courseRowId(m.key)}
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
      <IngredientMatchList plan={plan} onUseExisting={screen.chooseExisting} onCreate={screen.chooseCreate} onAnswerConversion={screen.answerConversion} />
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
      <ImportBar recipes={counts.recipes} questions={questions.length} busy={screen.busy} onNext={jump.next} onFirst={jump.goToFirst} onImport={() => void screen.confirm()} />
    </div>
  )
}
