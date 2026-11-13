import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../lib/http'
import { useCourses } from '../../../lib/courses/useCourses'
import { Button, ConfirmDialog, FormActions, PageHeader, Skeleton, Sortable, StickyActionBar, Tile } from '../../../ui'
import { KindChange } from '../components/KindChange'
import { EditorLineLinkSession } from '../components/EditorLineLinkSession'
import { UnitConversionPrompt } from '../components/UnitConversionPrompt'
import { baseUnitOfYield } from '../../../lib/baseRecipes/yield'
import { useRef } from 'react'
import { LinkCandidatesSheet } from '../components/LinkCandidatesSheet'
import { TakeOverDialog } from '../components/TakeOverDialog'
import { neededAtOverride, setBaseRecipe } from '../lib/baseRecipe'
import { NewIngredientSheet } from '../../ingredients/components/NewIngredientSheet'
import { CourseLossDialog } from '../components/CourseLossDialog'
import { IngredientLineRow } from '../components/IngredientLineRow'
import { PhotoPicker } from '../components/PhotoPicker'
import { RecipeDetailsFields } from '../components/RecipeDetailsFields'
import { useHouseholdFrozenUseBy } from '../hooks/useHouseholdFrozenUseBy'
import { useRecipeTags } from '../hooks/useRecipeTags'
import { RecipeSectionIndex } from '../components/RecipeSectionIndex'
import { StepsEditor } from '../components/StepsEditor'
import { useIngredientRefs } from '../hooks/useIngredientRefs'
import { useQuickCreateIngredient } from '../hooks/useQuickCreateIngredient'
import { useRecipeEditor } from '../hooks/useRecipeEditor'
import type { RecipeDraft } from '../lib/draft'
import { pickCourseIds } from '../lib/recipeCourses'
import { codeMessage, recipeStrings } from '../strings'
import { parseNumber } from '../lib/draft'
import type { IngredientRef } from '../types'
import '../recipes.css'

const SECTIONS = [
  { id: 'recipe-section-details', label: recipeStrings.fields.details },
  { id: 'recipe-section-photo', label: recipeStrings.photo },
  { id: 'recipe-section-ingredients', label: recipeStrings.ingredients },
  { id: 'recipe-section-steps', label: recipeStrings.stepsTitle },
]

/**
 * Routes /recipes/new and /recipes/:id/edit: one centred 840 px column of section cards (Details, Photo, Ingredients,
 * Steps) with a section index beside it from 1280 px, and a StickyActionBar with Cancel and Save Recipe. An unknown unit opens the inline Unit Conversion
 * prompt; saving then goes on from where it stopped.
 */
export function RecipeEditorScreen(): ReactNode {
  const navigate = useNavigate()
  const { id } = useParams()
  const recipeId = id === undefined ? undefined : Number(id)
  const refs = useIngredientRefs()
  const { known: knownTags, colourOf, isLoading: tagsLoading } = useRecipeTags()
  const householdFrozenUseBy = useHouseholdFrozenUseBy()
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

  const crumbs = useBreadcrumbs(editor.draft?.name)
  if (editor.isLoading) return <Skeleton variant="tile" count={3} />
  const draft = editor.draft
  const setDraft = (change: (d: RecipeDraft) => RecipeDraft) => editor.setDraft(change)

  const finish = (saved: { id: number; name?: string; baseRecipe?: boolean; baseIngredientId?: number } | null) => {
    if (!saved) return
    // A renamed Ready Meal: ask about its Ingredient before leaving the editor.
    if (editor.renameOffer) setAsking(saved)
    // BR-D: a Base recipe offers the bulk link first (its sheet closes into the Base recipe).
    else if (draft.baseRecipe && saved.baseRecipe !== false && saved.baseIngredientId !== undefined && baseUnitOfYield(draft.yieldUnit ?? '') !== null)
      setLinkSheet({ id: saved.id, name: saved.name ?? draft.name, ingredientId: saved.baseIngredientId })
    else navigate(`/recipes/${saved.id}`)
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
    navigate(`/recipes/${saved.id}`)
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
    }
  }

  const answer = async (toBase: number) => {
    setSaveError(null)
    try {
      finish(await editor.answerUnitPrompt(toBase))
    } catch (err) {
      failed(err)
    }
  }

  const lineByKey = (key: string | null) => (key === null ? undefined : draft.lines.find((l) => l.key === key))

  return (
    <>
      <div className="recipe-editor-layout">
        <RecipeSectionIndex sections={SECTIONS} />
        <section className="recipe-editor">
          <PageHeader title={recipeId === undefined ? recipeStrings.newRecipe : recipeStrings.editRecipe} breadcrumbs={crumbs} />
          <Tile as="section" id="recipe-section-details" className="recipe-editor__section" aria-labelledby="recipe-section-details-title">
            <h2 id="recipe-section-details-title">{recipeStrings.fields.details}</h2>
            <RecipeDetailsFields
              draft={draft}
              errors={editor.errors}
              knownTags={knownTags}
              colourOf={tagsLoading ? undefined : colourOf}
              courses={courses}
              householdFrozenUseBy={householdFrozenUseBy}
              onChange={changeDetails}
              onBaseRecipeChange={(on) => setDraft((d) => setBaseRecipe(d, on))}
            />
          </Tile>
          <div id="recipe-section-photo" className="recipe-editor__section">
            <PhotoPicker
              value={draft.image}
              onChange={(image) => setDraft((d) => ({ ...d, image }))}
              onBusyChange={(busy) => setPickerBusy('photo', busy)}
            />
          </div>
          <Tile
            as="section"
            id="recipe-section-ingredients"
            className="recipe-editor__section"
            aria-labelledby="recipe-section-ingredients-title"
          >
            <h2 id="recipe-section-ingredients-title">{recipeStrings.ingredients}</h2>
            {editor.errors.lines ? <p role="alert">{codeMessage(editor.errors.lines)}</p> : null}
            {draft.lines.length === 0 ? <p>{recipeStrings.lines.none}</p> : null}
            {draft.lines.length > 0 ? (
              <div className="recipe-editor__lines-head" aria-hidden="true">
                <span>{recipeStrings.lines.ingredient}</span>
                <span>{recipeStrings.lines.quantity}</span>
                <span>{recipeStrings.lines.unit}</span>
                <span>{recipeStrings.lines.note}</span>
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
                  onPick={(ing) => editor.pickIngredient(line.key, ing)}
                  onChange={(patch) => editor.updateLine(line.key, patch)}
                  steps={draft.steps}
                  neededAtDefault={(line.baseRecipeId ?? null) !== null ? (line.neededAtDefault ?? null) : null}
                  onNeededAt={(step) => editor.updateLine(line.key, { neededAtStep: neededAtOverride(step, line.neededAtDefault ?? null) })}
                  onLinkToBase={line.ingredientId !== null && (line.baseRecipeId ?? null) === null ? () => setSession({ kind: 'picker', key: line.key }) : undefined}
                  onUseAsPlain={() => setSession({ kind: 'plain', key: line.key })}
                  onRemove={() => editor.removeLine(line.key)}
                  onQuickCreate={(query) => quick.open({ lineKey: line.key, query, unit: line.unit })}
                  quickCreateDisabledReason={quick.disabledReason}
                  focusAmount={quick.focusLineKey === line.key}
                  onAmountFocused={quick.amountFocused}
                  focusIngredient={addedLine && i === draft.lines.length - 1}
                  onIngredientFocused={clearAddedLine}
                />
              )}
            />
            <Button
              variant="secondary"
              icon="add"
              onClick={() => {
                editor.addLine()
                setAddedLine(true)
              }}
            >
              {recipeStrings.lines.add}
            </Button>
          </Tile>
          <Tile as="section" id="recipe-section-steps" className="recipe-editor__section" aria-labelledby="recipe-section-steps-title">
            <h2 id="recipe-section-steps-title">{recipeStrings.stepsTitle}</h2>
            <StepsEditor steps={draft.steps} errors={editor.errors} onChange={editor.setSteps} ingredients={ingredients}
              onPhotoBusyChange={(key, busy) => setPickerBusy(`step:${key}`, busy)}
            />
          </Tile>
          {saveError ? <p role="alert">{saveError}</p> : null}
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
          {editor.refusal ? <p role="alert">{editor.refusal}</p> : Object.keys(editor.errors).length > 0 ? <p role="alert">{recipeStrings.checkFields}</p> : null}
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
              onClose={() => navigate(`/recipes/${linkSheet.id}`)}
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
            <Button variant="tertiary" onClick={() => navigate(-1)}>
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
