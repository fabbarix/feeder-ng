import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../lib/http'
import { Button, IconButton, PageHeader, Skeleton, Tile } from '../../../ui'
import { IngredientLineRow } from '../components/IngredientLineRow'
import { PhotoPicker } from '../components/PhotoPicker'
import { RecipeDetailsFields } from '../components/RecipeDetailsFields'
import { StepsEditor } from '../components/StepsEditor'
import { UnitConversionPrompt } from '../components/UnitConversionPrompt'
import { useIngredientRefs } from '../hooks/useIngredientRefs'
import { usePhotoUpload } from '../hooks/usePhotoUpload'
import { useRecipeEditor } from '../hooks/useRecipeEditor'
import type { RecipeDraft } from '../lib/draft'
import { codeMessage, recipeStrings } from '../strings'
import '../recipes.css'

/**
 * Routes /recipes/new and /recipes/:id/edit: sections as tiles (Details, Photo, Ingredients, Steps) built from the
 * field primitives, and a sticky footer with Cancel and Save Recipe. An unknown unit opens the inline Unit Conversion
 * prompt; saving then goes on from where it stopped.
 */
export function RecipeEditorScreen(): ReactNode {
  const navigate = useNavigate()
  const { id } = useParams()
  const recipeId = id === undefined ? undefined : Number(id)
  const editor = useRecipeEditor(recipeId)
  const refs = useIngredientRefs()
  const photo = usePhotoUpload()
  const [saveError, setSaveError] = useState<string | null>(null)
  const ingredients = useMemo(() => Array.from(refs.byId.values()), [refs.byId])

  if (editor.isLoading) return <Skeleton variant="tile" count={3} />
  const draft = editor.draft
  const setDraft = (change: (d: RecipeDraft) => RecipeDraft) => editor.setDraft(change)

  const finish = (saved: { id: number } | null) => {
    if (saved) navigate(`/recipes/${saved.id}`)
  }
  const failed = (err: unknown) => setSaveError(err instanceof ApiError ? codeMessage(err.code) : recipeStrings.generic)

  const save = async () => {
    setSaveError(null)
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

  const onFile = async (file: File) => {
    const imageId = await photo.upload(file)
    if (imageId) setDraft((d) => ({ ...d, image: imageId }))
  }

  return (
    <section className="recipe-editor">
      <PageHeader
        title={recipeId === undefined ? recipeStrings.newRecipe : recipeStrings.editRecipe}
        leading={<IconButton icon="back" label={recipeStrings.back} onClick={() => navigate(-1)} />}
      />
      <Tile as="section">
        <h2>{recipeStrings.fields.details}</h2>
        <RecipeDetailsFields draft={draft} errors={editor.errors} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      </Tile>
      <PhotoPicker
        imageUrl={draft.image ? `/api/images/${draft.image}` : ''}
        uploading={photo.uploading}
        error={photo.error}
        onFile={(file) => void onFile(file)}
        onRemove={() => setDraft((d) => ({ ...d, image: '' }))}
      />
      <Tile as="section">
        <h2>{recipeStrings.ingredients}</h2>
        {editor.errors.lines ? <p role="alert">{codeMessage(editor.errors.lines)}</p> : null}
        {draft.lines.length === 0 ? <p>{recipeStrings.lines.none}</p> : null}
        <ul className="recipe-editor__lines">
          {draft.lines.map((line, i) => (
            <IngredientLineRow
              key={line.key}
              line={line}
              index={i}
              errors={editor.errors}
              ingredient={line.ingredientId === null ? undefined : refs.byId.get(line.ingredientId)}
              ingredients={ingredients}
              onPick={(ing) => editor.pickIngredient(line.key, ing)}
              onChange={(patch) => editor.updateLine(line.key, patch)}
              onRemove={() => editor.removeLine(line.key)}
            />
          ))}
        </ul>
        <Button variant="secondary" icon="add" onClick={editor.addLine}>
          {recipeStrings.lines.add}
        </Button>
      </Tile>
      <Tile as="section">
        <h2>{recipeStrings.stepsTitle}</h2>
        <StepsEditor
          steps={draft.steps}
          errors={editor.errors}
          onChange={editor.setSteps}
          ingredients={ingredients}
          imageUpload={{ upload: photo.upload, uploading: photo.uploading, error: photo.error }}
        />
      </Tile>
      {saveError ? <p role="alert">{saveError}</p> : null}
      {Object.keys(editor.errors).length > 0 ? <p role="alert">{recipeStrings.checkFields}</p> : null}
      <div className="recipe-editor__footer">
        <Button variant="tertiary" onClick={() => navigate(-1)}>
          {recipeStrings.cancel}
        </Button>
        <Button onClick={() => void save()} loading={editor.saving}>
          {editor.saving ? recipeStrings.saving : recipeStrings.save}
        </Button>
      </div>
      {editor.unitPrompt ? (
        <UnitConversionPrompt prompt={editor.unitPrompt} onSave={(toBase) => void answer(toBase)} onCancel={editor.dismissUnitPrompt} />
      ) : null}
    </section>
  )
}
