import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../lib/http'
import { useCourses } from '../../../lib/courses/useCourses'
import { Button, ConfirmDialog, FormActions, PageHeader, Skeleton, Sortable, StickyActionBar, Tile } from '../../../ui'
import { NewIngredientSheet } from '../../ingredients/components/NewIngredientSheet'
import { CourseLossDialog } from '../components/CourseLossDialog'
import { IngredientLineRow } from '../components/IngredientLineRow'
import { PhotoPicker } from '../components/PhotoPicker'
import { RecipeDetailsFields } from '../components/RecipeDetailsFields'
import { useKnownTags } from '../hooks/useKnownTags'
import { RecipeSectionIndex } from '../components/RecipeSectionIndex'
import { StepsEditor } from '../components/StepsEditor'
import { UnitConversionPrompt } from '../components/UnitConversionPrompt'
import { useIngredientRefs } from '../hooks/useIngredientRefs'
import { useQuickCreateIngredient } from '../hooks/useQuickCreateIngredient'
import { useRecipeEditor } from '../hooks/useRecipeEditor'
import type { RecipeDraft } from '../lib/draft'
import { pickCourseIds } from '../lib/recipeCourses'
import { codeMessage, recipeStrings } from '../strings'
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
  const knownTags = useKnownTags()
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

  const crumbs = useBreadcrumbs(editor.draft?.name)
  if (editor.isLoading) return <Skeleton variant="tile" count={3} />
  const draft = editor.draft
  const setDraft = (change: (d: RecipeDraft) => RecipeDraft) => editor.setDraft(change)

  const finish = (saved: { id: number } | null) => {
    if (!saved) return
    // A renamed Ready Meal: ask about its Ingredient before leaving the editor.
    if (editor.renameOffer) setAsking(saved)
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

  const save = async (confirmed = false) => {
    setSaveError(null)
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

  return (
    <>
      <div className="recipe-editor-layout" aria-hidden={confirmingLoss || undefined}>
        <RecipeSectionIndex sections={SECTIONS} />
        <section className="recipe-editor">
          <PageHeader title={recipeId === undefined ? recipeStrings.newRecipe : recipeStrings.editRecipe} breadcrumbs={crumbs} />
          <Tile as="section" id="recipe-section-details" className="recipe-editor__section" aria-labelledby="recipe-section-details-title">
            <h2 id="recipe-section-details-title">{recipeStrings.fields.details}</h2>
            <RecipeDetailsFields
              draft={draft}
              errors={editor.errors}
              knownTags={knownTags}
              courses={courses}
              onChange={changeDetails}
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
          {Object.keys(editor.errors).length > 0 ? <p role="alert">{recipeStrings.checkFields}</p> : null}
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
            <Button variant="tertiary" aria-hidden={confirmingLoss || undefined} onClick={() => navigate(-1)}>
              {recipeStrings.cancel}
            </Button>
          }
          primary={
            <Button aria-hidden={confirmingLoss || undefined} onClick={() => void save()} loading={editor.saving} disabled={busyPickers.size > 0}>
              {editor.saving ? recipeStrings.saving : recipeStrings.save}
            </Button>
          }
        />
      </StickyActionBar>
    </>
  )
}
