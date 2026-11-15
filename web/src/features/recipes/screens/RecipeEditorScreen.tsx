import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../lib/http'
import { useCourses } from '../../../lib/courses/useCourses'
import {
  Button,
  ConfirmDialog,
  DraftNotice,
  FormActions,
  Icon,
  PageHeader,
  Skeleton,
  Sortable,
  StickyActionBar,
  Tile,
  useConfirm,
  useLeaveGuard,
  useUndoToast,
} from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { KindChange } from '../components/KindChange'
import { EditorLineLinkSession } from '../components/EditorLineLinkSession'
import { UnitConversionPrompt } from '../components/UnitConversionPrompt'
import { baseUnitOfYield } from '../../../lib/baseRecipes/yield'
import { useRef } from 'react'
import { LinkCandidatesSheet } from '../components/LinkCandidatesSheet'
import { TakeOverDialog } from '../components/TakeOverDialog'
import { neededAtOverride, setKind } from '../lib/baseRecipe'
import { NewIngredientSheet } from '../../ingredients/components/NewIngredientSheet'
import { CourseLossDialog } from '../components/CourseLossDialog'
import { IngredientLineRow } from '../components/IngredientLineRow'
import { RecipeAboutFields } from '../components/RecipeAboutFields'
import { RecipeBasicsFields } from '../components/RecipeBasicsFields'
import { RecipePlanningFields } from '../components/RecipePlanningFields'
import { RecipeYieldField } from '../components/RecipeYieldField'
import { useHouseholdPlanningDefaults } from '../hooks/useHouseholdPlanningDefaults'
import { Disclosure } from '../../../ui/Disclosure'
import { aboutSummary, planningSummary, sectionInvalid } from '../lib/editorSummary'
import { useRecipeTags } from '../hooks/useRecipeTags'
import { RecipeSectionIndex } from '../components/RecipeSectionIndex'
import { StepsEditor } from '../components/StepsEditor'
import { useIngredientRefs } from '../hooks/useIngredientRefs'
import { useQuickCreateIngredient } from '../hooks/useQuickCreateIngredient'
import { useRecipeEditor } from '../hooks/useRecipeEditor'
import { useRecipeDraft } from '../hooks/useRecipeDraft'
import { useRemovalFocus } from '../hooks/useRemovalFocus'
import { discardDialog, editorExitRoute } from '../lib/editorExit'
import type { RecipeDraft } from '../lib/draft'
import { pickCourseIds } from '../lib/recipeCourses'
import { codeMessage, recipeStrings } from '../strings'
import { parseNumber } from '../lib/draft'
import type { IngredientRef } from '../types'
import '../recipe-detail.css'
import '../recipe-editor.css'
import '../recipe-editor.lines.css'
import '../recipe-editor.steps.css'
import '../recipe-editor.sections.css'

const SECTIONS = [
  { id: 'recipe-section-recipe', label: recipeStrings.fields.sectionRecipe },
  { id: 'recipe-section-ingredients', label: recipeStrings.ingredients },
  { id: 'recipe-section-steps', label: recipeStrings.stepsTitle },
  { id: 'recipe-section-about', label: recipeStrings.fields.sectionAbout },
  { id: 'recipe-section-planning', label: recipeStrings.fields.sectionPlanning },
]
/** RX-02: which closed sections the person left open on this device (only the ids). */
const OPEN_KEY = 'feeder.recipeEditor.open'

/**
 * Routes /recipes/new and /recipes/:id/edit: one centred 840 px column of section cards with a section index beside it from 1280 px, and
 * a StickyActionBar with Cancel and Save Recipe on the form column. B9-37 (RX-02): Recipe (Name, Photo, Kind) · Ingredients (with the
 * Yield) · Steps · "Description and source" and "Planning" as closed Disclosures with a one-line summary. A new Recipe puts the cursor in
 * the Name and opens with one empty line and one empty Step. An unknown unit opens the inline Unit Conversion prompt; saving then goes on
 * from where it stopped.
 * B9-31: the editor keeps work. While dirty every in-app exit asks "Leave without saving?" (useLeaveGuard); a reload draft covers a
 * reload or a crash (useRecipeDraft, with its DraftNotice); Cancel goes to a known route and asks "Discard your changes?" while dirty;
 * removing a Step, line or use offers Undo; a failed Save focuses the first invalid field (SAFE-04).
 */
export function RecipeEditorScreen(): ReactNode {
  const navigate = useNavigate()
  const { id } = useParams()
  const recipeId = id === undefined ? undefined : Number(id)
  const refs = useIngredientRefs()
  const { known: knownTags, colourOf, isLoading: tagsLoading } = useRecipeTags()
  const planningDefaults = useHouseholdPlanningDefaults()
  const [saveError, setSaveError] = useState<string | null>(null)
  // Ingredients made from the picker, known at once (the list refetch may still be on its way).
  const [made, setMade] = useState<IngredientRef[]>([])
  const ingredients = useMemo(() => {
    const all = Array.from(refs.byId.values())
    return [...all, ...made.filter((m) => !refs.byId.has(m.id))]
  }, [refs.byId, made])
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i] as const)), [ingredients])
  const { choices: courses } = useCourses()
  const editor = useRecipeEditor(recipeId, ingredients, courses)
  const isNew = recipeId === undefined
  // The leave and discard dialogs name the STORED Recipe ("Your changes to Roast tray"), not the name being typed.
  const what = editor.storedName ?? recipeStrings.recipeNoun
  const quick = useQuickCreateIngredient({
    pick: (lineKey, ingredient) => {
      setMade((list) => [...list.filter((i) => i.id !== ingredient.id), ingredient])
      editor.pickCreatedIngredient(lineKey, ingredient)
    },
  })
  // PE: pickers that are uploading right now ('photo' and one 'step:<key>' per Step); Save waits for the set to empty.
  // L13: set by Add ingredient so the new line's Ingredient picker takes focus.
  const [addedLine, setAddedLine] = useState(false)
  const clearAddedLine = useCallback(() => setAddedLine(false), [])
  // RX-08: a pick moves the cursor to that line's Quantity (a quick create asks the same through `quick.focusLineKey`).
  const [pickedLine, setPickedLine] = useState<string | null>(null)
  const clearPickedLine = useCallback(() => setPickedLine(null), [])
  const [busyPickers, setBusyPickers] = useState<ReadonlySet<string>>(new Set())
  const setPickerBusy = useCallback((id: string, busy: boolean) => {
    setBusyPickers((cur) => {
      if (cur.has(id) === busy) return cur
      const next = new Set(cur)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  const [asking, setAsking] = useState<{ id: number } | null>(null)
  // CRS E2: a save that takes a Course off and so removes Slot Rules waits for the User's confirm.
  const [confirmingLoss, setConfirmingLoss] = useState(false)
  // BR-D: the Base recipe switch (asks first on a saved Recipe), the line links, and the bulk link sheet after a Base recipe is saved.
  const [linkSheet, setLinkSheet] = useState<{ id: number; name: string; ingredientId: number } | null>(null)
  // A line action runs as a session (EditorLineLinkSession); a kind change runs on Save (KindChange).
  const [session, setSession] = useState<{ kind: 'picker' | 'plain'; key: string } | null>(null)
  const [kindRequest, setKindRequest] = useState<{ on: boolean } | null>(null)
  const kindBusy = useRef(false)
  const kindDone = useRef(false)

  // SAFE-01: an upload in progress counts as unsaved (the guard asks), but only the draft itself is kept for a reload.
  const dirty = editor.dirty || busyPickers.size > 0
  const keeper = useRecipeDraft({
    recipeId,
    ready: editor.ready,
    draft: editor.draft,
    dirty: editor.dirty,
    storedUpdatedAt: editor.storedUpdatedAt,
    what,
    restore: editor.restoreDraft,
    reset: editor.resetDraft,
  })
  const guard = useLeaveGuard(dirty, { what, isNew, onDiscard: () => void keeper.forget() })
  const confirmApi = useConfirm()
  const undoToast = useUndoToast()
  const formRef = useRef<HTMLElement>(null)
  const focusAfter = useRemovalFocus(formRef)
  // SAFE-04: grows after every Save the editor answered (client check or server), so focus goes to the first invalid field.
  const [submits, setSubmits] = useState(0)
  // B9-37: focus follows one render later. A closed Disclosure that holds the invalid field opens itself in that render (its `invalid`),
  // so the field is shown before it takes focus; a server refusal arrives in the same render as its submit, too late to open it first.
  const [focusSubmits, setFocusSubmits] = useState(0)
  useEffect(() => {
    if (focusSubmits !== submits) setFocusSubmits(submits)
  }, [submits, focusSubmits])
  useFocusFirstInvalid(formRef, editor.errors, focusSubmits)

  const crumbs = useBreadcrumbs(editor.draft?.name)
  if (editor.isLoading) return <Skeleton variant="tile" count={3} />
  const draft = editor.draft
  const setDraft = (change: (d: RecipeDraft) => RecipeDraft) => editor.setDraft(change)

  // Save, the rename answer and the link sheet leave through the guard's bypass: the editor is clean by then, but the guard learns
  // it only on the next render.
  const go = (to: string, replace = false) => guard.bypass(() => navigate(to, replace ? { replace: true } : undefined))

  const finish = (saved: { id: number; name?: string; baseRecipe?: boolean; baseIngredientId?: number } | null) => {
    if (!saved) {
      setSubmits((n) => n + 1)
      return
    }
    void keeper.forget()
    // A renamed Ready Meal: ask about its Ingredient before leaving the editor.
    if (editor.renameOffer) setAsking(saved)
    // BR-D: a Base recipe offers the bulk link first (its sheet closes into the Base recipe).
    else if (draft.baseRecipe && saved.baseRecipe !== false && saved.baseIngredientId !== undefined && baseUnitOfYield(draft.yieldUnit ?? '') !== null)
      setLinkSheet({ id: saved.id, name: saved.name ?? draft.name, ingredientId: saved.baseIngredientId })
    else go(`/recipes/${saved.id}`)
  }

  const answerRename = async (rename: boolean) => {
    const saved = asking
    setAsking(null)
    if (!saved) return
    if (rename) {
      try {
        await editor.renameLinkedIngredient()
      } catch {
        setSaveError(recipeStrings.readyMealIngredient.renameFailed)
      }
    }
    go(`/recipes/${saved.id}`)
  }
  // The Courses picker says the new list; its change is applied to the latest draft (lib/recipeCourses.pickCourseIds).
  const changeDetails = (patch: Partial<RecipeDraft>) =>
    setDraft((d) => ({
      ...d,
      ...patch,
      ...(patch.courseIds ? { courseIds: pickCourseIds(d.courseIds, draft.courseIds, patch.courseIds, courses) } : {}),
    }))
  const failed = (err: unknown) => setSaveError(err instanceof ApiError ? codeMessage(err.code) : recipeStrings.generic)

  // BR-D round 3: a changed kind is asked on Save (once: a second press while it asks does nothing), then the Recipe saves.
  const storedBase = editor.storedKind === 'base'
  const kindChanged = editor.storedKind !== null && (draft.baseRecipe === true) !== storedBase
  const kindResult = (outcome: 'done' | 'cancelled' | 'failed', message: string | null) => {
    kindBusy.current = false
    setKindRequest(null)
    if (outcome === 'done') {
      kindDone.current = true
      void save()
    } else if (outcome === 'failed') setSaveError(message)
  }
  const save = async (confirmed = false) => {
    if (kindBusy.current) return
    setSaveError(null)
    if (kindChanged && !kindDone.current) {
      kindBusy.current = true
      setKindRequest({ on: draft.baseRecipe === true })
      return
    }
    kindDone.current = false
    if (!confirmed && editor.courseLoss) {
      setConfirmingLoss(true)
      return
    }
    try {
      finish(await editor.save())
    } catch (err) {
      failed(err)
      setSubmits((n) => n + 1)
    }
  }

  // SAFE-06: Cancel discards on purpose, so it asks its own question (never the leave dialog too) and goes to a known route.
  const cancel = async () => {
    if (dirty) {
      if (!(await confirmApi.confirm(discardDialog(what, isNew)))) return
      await keeper.forget()
    }
    go(editorExitRoute(recipeId), true)
  }

  // SAFE-10: a removal acts at once and offers Undo; focus moves to what took the removed row's place.
  const lineName = (key: string) => {
    const line = draft.lines.find((l) => l.key === key)
    return (line?.ingredientName || (line?.ingredientId === null || line?.ingredientId === undefined ? '' : byId.get(line.ingredientId)?.name) || '').trim()
  }
  const removeLine = (key: string) => {
    const index = draft.lines.findIndex((l) => l.key === key)
    const name = lineName(key)
    const restore = editor.removeLine(key)
    if (!restore) return
    focusAfter({ kind: 'line', index })
    undoToast.show({
      headline: recipeStrings.removed.line(name, index + 1),
      undoAriaLabel: recipeStrings.removed.undo.line(name, index + 1),
      undo: () => {
        restore()
        focusAfter({ kind: 'line', index })
      },
    })
  }
  const removeStep = (index: number) => {
    const restore = editor.removeStep(index)
    if (!restore) return
    focusAfter({ kind: 'step', index })
    undoToast.show({
      headline: recipeStrings.removed.step(index + 1),
      undoAriaLabel: recipeStrings.removed.undo.step(index + 1),
      undo: () => {
        restore()
        focusAfter({ kind: 'step', index })
      },
    })
  }
  const removeUse = (stepIndex: number, useIndex: number) => {
    const step = draft.steps[stepIndex]
    const use = step?.uses[useIndex]
    if (!step || !use) return
    const name = (use.ingredientName || (use.ingredientId === null ? '' : byId.get(use.ingredientId)?.name) || '').trim()
    const restore = editor.removeUse(stepIndex, useIndex)
    if (!restore) return
    focusAfter({ kind: 'use', stepKey: step.key, index: useIndex })
    undoToast.show({
      headline: recipeStrings.removed.use(name, stepIndex + 1),
      undoAriaLabel: recipeStrings.removed.undo.use(name, stepIndex + 1),
      undo: () => {
        restore()
        focusAfter({ kind: 'use', stepKey: step.key, index: useIndex })
      },
    })
  }

  const answer = async (toBase: number) => {
    setSaveError(null)
    try {
      finish(await editor.answerUnitPrompt(toBase))
    } catch (err) {
      failed(err)
      setSubmits((n) => n + 1)
    }
  }

  // Add ingredient, or Enter in the last field of the last line: a new line whose picker takes the cursor (L13, RX-02).
  const addLine = () => {
    editor.addLine()
    setAddedLine(true)
  }

  const lineByKey = (key: string | null) => (key === null ? undefined : draft.lines.find((l) => l.key === key))

  return (
    <>
      <div className="recipe-editor-layout">
        <RecipeSectionIndex sections={SECTIONS} />
        <section className="recipe-editor" ref={formRef}>
          <PageHeader title={recipeId === undefined ? recipeStrings.newRecipe : recipeStrings.editRecipe} breadcrumbs={crumbs} />
          {keeper.notice ? <DraftNotice {...keeper.notice} /> : null}
          <Tile as="section" id="recipe-section-recipe" className="recipe-editor__section" aria-label={recipeStrings.fields.sectionRecipe}>
            <RecipeBasicsFields
              draft={draft}
              errors={editor.errors}
              autoFocusName={isNew}
              onName={(name) => setDraft((d) => ({ ...d, name }))}
              onImage={(image) => setDraft((d) => ({ ...d, image }))}
              onKind={(kind) => setDraft((d) => setKind(d, kind))}
              onPhotoBusyChange={(busy) => setPickerBusy('photo', busy)}
            />
          </Tile>
          <Tile
            as="section"
            id="recipe-section-ingredients"
            className="recipe-editor__section"
            aria-labelledby="recipe-section-ingredients-title"
          >
            <div className="recipe-editor__section-head">
              <h2 id="recipe-section-ingredients-title">{recipeStrings.ingredients}</h2>
              <RecipeYieldField draft={draft} errors={editor.errors} onChange={changeDetails} />
            </div>
            {editor.errors.lines ? (
              <p id="recipe-lines-error" className="ui-field__error">
                <Icon name="error" size={14} />
                <span>{codeMessage(editor.errors.lines)}</span>
              </p>
            ) : null}
            {draft.lines.length === 0 ? <p>{recipeStrings.lines.none}</p> : null}
            <div className="recipe-editor__lines-box">
              {draft.lines.length > 0 ? (
                <div className="recipe-editor__lines-head" aria-hidden="true">
                  <span />
                  <span>{recipeStrings.lines.ingredient}</span>
                  <span>{recipeStrings.lines.quantity}</span>
                  <span>{recipeStrings.lines.unit}</span>
                  <span>{recipeStrings.lines.note}</span>
                  <span>{recipeStrings.lines.optional}</span>
                  <span />
                </div>
              ) : null}
              <Sortable
                as="ul"
                className="recipe-editor__lines"
                items={draft.lines}
                getKey={(line) => line.key}
                getLabel={(line, i) =>
                  (line.ingredientName || (line.ingredientId === null ? '' : byId.get(line.ingredientId)?.name) || '').trim() ||
                  recipeStrings.lines.lineLabel(i + 1)
                }
                onReorder={editor.moveLine}
                renderItem={(line, { index: i, handle, itemProps }) => (
                  <IngredientLineRow
                    line={line}
                    index={i}
                    handle={handle}
                    itemProps={itemProps}
                    count={draft.lines.length}
                    onMove={(delta) => editor.moveLine(i, i + delta)}
                    errors={editor.errors}
                    ingredient={line.ingredientId === null ? undefined : byId.get(line.ingredientId)}
                    ingredients={ingredients}
                    onPick={(ing) => {
                      editor.pickIngredient(line.key, ing)
                      setPickedLine(line.key)
                    }}
                    onChange={(patch) => editor.updateLine(line.key, patch)}
                    steps={draft.steps}
                    neededAtDefault={(line.baseRecipeId ?? null) !== null ? (line.neededAtDefault ?? null) : null}
                    onNeededAt={(step) => editor.updateLine(line.key, { neededAtStep: neededAtOverride(step, line.neededAtDefault ?? null) })}
                    onLinkToBase={line.ingredientId !== null && (line.baseRecipeId ?? null) === null ? () => setSession({ kind: 'picker', key: line.key }) : undefined}
                    onUseAsPlain={() => setSession({ kind: 'plain', key: line.key })}
                    onRemove={() => removeLine(line.key)}
                    onQuickCreate={(query) => quick.open({ lineKey: line.key, query, unit: line.unit })}
                    quickCreateDisabledReason={quick.disabledReason}
                    focusAmount={quick.focusLineKey === line.key || pickedLine === line.key}
                    onAmountFocused={pickedLine === line.key ? clearPickedLine : quick.amountFocused}
                    focusIngredient={addedLine && i === draft.lines.length - 1}
                    onIngredientFocused={clearAddedLine}
                    onEnterLast={i === draft.lines.length - 1 ? addLine : undefined}
                  />
                )}
              />
            </div>
            <Button
              variant="secondary"
              icon="add"
              data-invalid-target={editor.errors.lines ? '' : undefined}
              aria-describedby={editor.errors.lines ? 'recipe-lines-error' : undefined}
              onClick={addLine}
            >
              {recipeStrings.lines.add}
            </Button>
          </Tile>
          <Tile as="section" id="recipe-section-steps" className="recipe-editor__section" aria-labelledby="recipe-section-steps-title">
            <h2 id="recipe-section-steps-title">{recipeStrings.stepsTitle}</h2>
            <StepsEditor steps={draft.steps} errors={editor.errors} onChange={editor.setSteps} ingredients={ingredients}
              onPhotoBusyChange={(key, busy) => setPickerBusy(`step:${key}`, busy)}
              onRemoveStep={removeStep}
              onRemoveUse={removeUse}
            />
          </Tile>
          <Disclosure
            id="recipe-section-about"
            title={recipeStrings.fields.sectionAbout}
            summary={aboutSummary(draft)}
            persistKey={OPEN_KEY}
            invalid={sectionInvalid(editor.errors, 'about')}
          >
            <RecipeAboutFields draft={draft} errors={editor.errors} onChange={changeDetails} />
          </Disclosure>
          <Disclosure
            id="recipe-section-planning"
            title={recipeStrings.fields.sectionPlanning}
            summary={planningSummary(draft, courses)}
            persistKey={OPEN_KEY}
            invalid={sectionInvalid(editor.errors, 'planning')}
          >
            <RecipePlanningFields
              draft={draft}
              errors={editor.errors}
              onChange={changeDetails}
              courses={courses}
              knownTags={knownTags}
              colourOf={tagsLoading ? undefined : colourOf}
              defaults={planningDefaults}
            />
          </Disclosure>
          {kindRequest ? (
            <KindChange
              recipeId={recipeId}
              on={kindRequest.on}
              name={draft.name}
              yieldValue={parseNumber(draft.yield) ?? 1}
              yieldUnit={draft.yieldUnit || 'portion'}
              onResult={kindResult}
            />
          ) : null}
          <FormError>{saveError ?? editor.refusal}</FormError>
          {session && lineByKey(session.key) ? (
            <EditorLineLinkSession
              recipeId={recipeId}
              kind={session.kind}
              line={lineByKey(session.key)!}
              ingredientOf={(id) => byId.get(id)}
              ingredients={ingredients}
              linkLine={editor.linkLine}
              unlinkLine={editor.unlinkLine}
              onDone={() => setSession(null)}
              onFailed={setSaveError}
            />
          ) : null}
          <TakeOverDialog
            ask={editor.takeOverAsk}
            baseName={draft.name}
            onAnswer={(yes) => {
              void editor.answerTakeOver(yes).then((saved) => finish(saved))
            }}
            onCancel={editor.cancelTakeOver}
          />
          {linkSheet ? (
            <LinkCandidatesSheet
              open
              baseRecipe={{ id: linkSheet.id, name: linkSheet.name, ingredientId: linkSheet.ingredientId }}
              onClose={() => go(`/recipes/${linkSheet.id}`)}
            />
          ) : null}
          <NewIngredientSheet
            open={quick.request !== null}
            onClose={quick.close}
            initialName={quick.request?.query}
            unitHint={quick.request?.unit}
            disabledReason={quick.disabledReason}
            onCreate={async (body) => {
              const created = await quick.create(body)
              quick.select(created)
              return created
            }}
            onUseExisting={quick.select}
          />
          {editor.renameOffer ? (
            <ConfirmDialog
              open={asking !== null}
              title={recipeStrings.readyMealIngredient.renameTitle}
              body={recipeStrings.readyMealIngredient.renameBody(editor.renameOffer.from, editor.renameOffer.to)}
              confirmLabel={recipeStrings.readyMealIngredient.renameConfirm}
              cancelLabel={recipeStrings.readyMealIngredient.renameKeep}
              focus="confirm"
              onConfirm={() => void answerRename(true)}
              onCancel={() => void answerRename(false)}
            />
          ) : null}
          {editor.unitPrompt ? (
            <UnitConversionPrompt prompt={editor.unitPrompt} onSave={(toBase) => void answer(toBase)} onCancel={editor.dismissUnitPrompt} />
          ) : null}
        </section>
      </div>
      {editor.courseLoss ? (
        <CourseLossDialog
          open={confirmingLoss}
          loss={editor.courseLoss}
          onConfirm={() => {
            setConfirmingLoss(false)
            void save(true)
          }}
          onCancel={() => setConfirmingLoss(false)}
        />
      ) : null}
      <StickyActionBar label={recipeStrings.editorActions} column="form">
        <FormActions
          tertiary={
            <Button variant="secondary" onClick={() => void cancel()}>
              {recipeStrings.cancel}
            </Button>
          }
          primary={
            <Button onClick={() => void save()} loading={editor.saving} disabled={busyPickers.size > 0}>
              {editor.saving ? recipeStrings.saving : recipeStrings.save}
            </Button>
          }
        />
      </StickyActionBar>
    </>
  )
}
