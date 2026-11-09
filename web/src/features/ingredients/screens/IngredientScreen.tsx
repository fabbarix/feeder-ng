import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BottomSheet, Button, Chip, EmptyState } from '../../../ui'
import { ConversionEditor } from '../components/ConversionEditor'
import { MergeSheet } from '../components/MergeSheet'
import { ShelfLifeEditor } from '../components/ShelfLifeEditor'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useIngredient } from '../hooks/useIngredient'
import { errorMessage } from '../lib/errorMessage'
import { strings } from '../strings'
import type { BaseUnit } from '../../../lib/units'

const BASE_UNITS: readonly BaseUnit[] = ['g', 'ml', 'piece']

/**
 * Route /ingredients/:id. Heading = name; "Rename" (inline Name field + "Save name"); the Base Unit as a chip with
 * a "Change Base Unit" chip group disabled with strings.baseUnitLocked(n) while referenced; ShelfLifeEditor;
 * ConversionEditor; "Merge into another Ingredient" (MergeSheet, on success navigates to the survivor);
 * "Delete Ingredient" (disabled with strings.deleteLocked(n) while referenced; otherwise asks strings.deleteConfirm
 * in a sheet, then deletes and navigates to /ingredients). Unknown id shows an EmptyState with a link back.
 */
export function IngredientScreen() {
  const { id: rawId } = useParams()
  const id = Number(rawId)
  const navigate = useNavigate()
  const system = useDisplayUnitSystem()
  const ing = useIngredient(id)

  const [renaming, setRenaming] = useState(false)
  const [nameText, setNameText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const ingredient = ing.ingredient
  if (!ingredient) {
    return (
      <EmptyState
        title={strings.notFoundTitle}
        action={<Link to="/ingredients">{strings.title}</Link>}
      />
    )
  }

  const locked = ing.referenceCount > 0

  /** Runs a change, showing its failure inline. Resolves to true when it went through. */
  const attempt = async (change: () => Promise<unknown>): Promise<boolean> => {
    setError(null)
    try {
      await change()
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    }
  }

  const saveName = async () => {
    if (await attempt(() => ing.rename(nameText))) setRenaming(false)
  }

  const remove = async () => {
    if (await attempt(() => ing.remove())) navigate('/ingredients')
  }

  return (
    <section>
      <h1>{ingredient.name}</h1>
      {error ? <p role="alert">{error}</p> : null}

      {renaming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void saveName()
          }}
        >
          <label>
            {strings.nameLabel}
            <input value={nameText} onChange={(e) => setNameText(e.target.value)} />
          </label>
          <Button type="submit">{strings.saveName}</Button>
        </form>
      ) : (
        <Button
          variant="ghost"
          onClick={() => {
            setNameText(ingredient.name)
            setRenaming(true)
          }}
        >
          {strings.rename}
        </Button>
      )}

      <section>
        <Chip>{ingredient.baseUnit}</Chip>
        <fieldset disabled={locked}>
          <legend>{strings.baseUnitLabel}</legend>
          {BASE_UNITS.map((b) => (
            <Chip
              key={b}
              selected={ingredient.baseUnit === b}
              onClick={() => {
                if (b !== ingredient.baseUnit) void attempt(() => ing.setBaseUnit(b))
              }}
            >
              {b}
            </Chip>
          ))}
        </fieldset>
        {locked ? <p>{strings.baseUnitLocked(ing.referenceCount)}</p> : null}
      </section>

      <ShelfLifeEditor days={ingredient.shelfLifeDays} onSave={(days) => void attempt(() => ing.setShelfLife(days))} />

      <ConversionEditor
        conversions={ingredient.conversions}
        base={ingredient.baseUnit}
        system={system}
        onAdd={(c) => void attempt(() => ing.setConversion(c))}
        onRemove={(unit) => void attempt(() => ing.removeConversion(unit))}
      />

      <Button variant="tonal" onClick={() => setMergeOpen(true)}>
        {strings.mergeInto}
      </Button>
      <MergeSheet
        open={mergeOpen}
        sourceId={id}
        onClose={() => setMergeOpen(false)}
        onMerged={(targetId) => {
          setMergeOpen(false)
          navigate(`/ingredients/${targetId}`)
        }}
      />

      <Button variant="ghost" disabled={locked} onClick={() => setDeleteOpen(true)}>
        {strings.deleteIngredient}
      </Button>
      {locked ? <p>{strings.deleteLocked(ing.referenceCount)}</p> : null}
      <BottomSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={strings.deleteIngredient}>
        <p>{strings.deleteConfirm(ingredient.name)}</p>
        <Button onClick={() => void remove()}>{strings.deleteIngredient}</Button>
      </BottomSheet>
    </section>
  )
}
