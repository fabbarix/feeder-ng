import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../lib/http'
import { Button } from '../../../ui'
import { IngredientLineRow } from '../components/IngredientLineRow'
import { PhotoPicker } from '../components/PhotoPicker'
import { RecipeDetailsFields } from '../components/RecipeDetailsFields'
import { StepsEditor } from '../components/StepsEditor'
import { UnitConversionPrompt } from '../components/UnitConversionPrompt'
import { useIngredientRefs } from '../hooks/useIngredientRefs'
import { useIngredientSearch } from '../hooks/useIngredientSearch'
import { usePhotoUpload } from '../hooks/usePhotoUpload'
import { useRecipeEditor } from '../hooks/useRecipeEditor'
import { newKey, type LineDraft, type RecipeDraft } from '../lib/draft'
import { codeMessage, recipeStrings } from '../strings'
import type { IngredientRef } from '../types'

/**
 * Routes /recipes/new and /recipes/:id/edit: the details, the photo, the ingredient lines (Ingredient
 * search, Quantity, Unit, optional, Note), the Steps, and Save. An unknown unit opens the inline Unit
 * Conversion prompt; saving then goes on from where it stopped.
 */
export function RecipeEditorScreen(): ReactNode {
  const navigate = useNavigate()
  const { id } = useParams()
  const recipeId = id === undefined ? undefined : Number(id)
  const editor = useRecipeEditor(recipeId)
  const refs = useIngredientRefs()
  const photo = usePhotoUpload()
  const [searching, setSearching] = useState<{ key: string; text: string } | null>(null)
  const results = useIngredientSearch(searching?.text ?? '')
  const [saveError, setSaveError] = useState<string | null>(null)

  if (editor.isLoading) return <p>{recipeStrings.loading}</p>
  const draft = editor.draft
  const setDraft = (change: (d: RecipeDraft) => RecipeDraft) => editor.setDraft(change)

  const finish = (saved: { id: number } | null) => {
    if (saved) navigate(`/recipes/${saved.id}`)
  }

  const save = async () => {
    setSaveError(null)
    try {
      finish(await editor.save())
    } catch (err) {
      setSaveError(err instanceof ApiError ? codeMessage(err.code) : recipeStrings.generic)
    }
  }

  const answer = async (toBase: number) => {
    setSaveError(null)
    try {
      finish(await editor.answerUnitPrompt(toBase))
    } catch (err) {
      setSaveError(err instanceof ApiError ? codeMessage(err.code) : recipeStrings.generic)
    }
  }

  const updateLine = (key: string, patch: Partial<LineDraft>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }))

  const pick = (line: LineDraft, ing: IngredientRef) => {
    updateLine(line.key, { ingredientId: ing.id, ingredientName: ing.name, unit: ing.baseUnit })
    setSearching(null)
  }

  const addLine = () =>
    setDraft((d) => ({
      ...d,
      lines: [...d.lines, { key: newKey('line'), ingredientId: null, ingredientName: '', quantity: '', unit: '', optional: false, note: '' }],
    }))

  const onFile = async (file: File) => {
    const imageId = await photo.upload(file)
    if (imageId) setDraft((d) => ({ ...d, image: imageId }))
  }

  return (
    <section>
      <h1>{recipeId === undefined ? recipeStrings.newRecipe : recipeStrings.editRecipe}</h1>
      <RecipeDetailsFields draft={draft} errors={editor.errors} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      <PhotoPicker
        imageUrl={draft.image ? `/api/images/${draft.image}` : ''}
        uploading={photo.uploading}
        error={photo.error}
        onFile={(file) => void onFile(file)}
        onRemove={() => setDraft((d) => ({ ...d, image: '' }))}
      />
      <h2>{recipeStrings.ingredients}</h2>
      {editor.errors.lines ? <p role="alert">{codeMessage(editor.errors.lines)}</p> : null}
      {draft.lines.length === 0 ? <p>{recipeStrings.lines.none}</p> : null}
      <ul>
        {draft.lines.map((line, i) => (
          <IngredientLineRow
            key={line.key}
            line={line}
            index={i}
            errors={editor.errors}
            ingredient={line.ingredientId === null ? undefined : refs.byId.get(line.ingredientId)}
            results={searching?.key === line.key ? results : []}
            onSearch={(text) => setSearching({ key: line.key, text })}
            onPick={(ing) => pick(line, ing)}
            onChange={(patch) => updateLine(line.key, patch)}
            onRemove={() => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== line.key) }))}
          />
        ))}
      </ul>
      <Button variant="tonal" onClick={addLine}>
        {recipeStrings.lines.add}
      </Button>
      <h2>{recipeStrings.stepsTitle}</h2>
      <StepsEditor steps={draft.steps} errors={editor.errors} onChange={(steps) => setDraft((d) => ({ ...d, steps }))} />
      {saveError ? <p role="alert">{saveError}</p> : null}
      {Object.keys(editor.errors).length > 0 ? <p role="alert">{recipeStrings.checkFields}</p> : null}
      <div>
        <Button onClick={() => void save()} loading={editor.saving}>
          {editor.saving ? recipeStrings.saving : recipeStrings.save}
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          {recipeStrings.cancel}
        </Button>
      </div>
      {editor.unitPrompt ? (
        <UnitConversionPrompt prompt={editor.unitPrompt} onSave={(toBase) => void answer(toBase)} onCancel={editor.dismissUnitPrompt} />
      ) : null}
    </section>
  )
}
