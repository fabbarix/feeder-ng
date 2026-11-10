import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../lib/http'
import type { BaseUnit } from '../../../lib/units'
import { BentoGrid, BottomSheet, Button, Chip, EmptyState, TextField, Tile } from '../../../ui'
import { IngredientProducts } from '../../products'
import { ConversionEditor } from '../components/ConversionEditor'
import { MergeSheet } from '../components/MergeSheet'
import { ShelfLifeEditor } from '../components/ShelfLifeEditor'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useIngredient } from '../hooks/useIngredient'
import { errorMessage } from '../lib/errorMessage'
import { strings } from '../strings'

const BASE_UNITS: readonly BaseUnit[] = ['g', 'ml', 'piece']

/**
 * Route /ingredients/:id. Heading = name; "Rename" (inline Name field + "Save name"). Below it a BentoGrid of Tiles:
 * Base Unit (chip group disabled with strings.baseUnitLocked(n) while referenced), Shelf Life (ShelfLifeEditor),
 * Unit Conversions (ConversionEditor), Merge (opens MergeSheet; on success navigates to the survivor) and Delete
 * (disabled with strings.deleteLocked(n) while referenced; otherwise asks strings.deleteConfirm in a sheet, then
 * deletes and navigates to /ingredients). While loading shows strings.loading; an unknown id (404) shows an
 * EmptyState with a link back.
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
    if (ing.isLoading) return <p role="status">{strings.loading}</p>
    if (ing.error instanceof ApiError && ing.error.status === 404) {
      return <EmptyState title={strings.notFoundTitle} action={<Link to="/ingredients">{strings.title}</Link>} />
    }
    return <p role="alert">{strings.actionFailed}</p>
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
          <TextField label={strings.nameLabel} value={nameText} onChange={setNameText} />
          <Button type="submit">{strings.saveName}</Button>
        </form>
      ) : (
        <Button
          variant="tertiary"
          onClick={() => {
            setNameText(ingredient.name)
            setRenaming(true)
          }}
        >
          {strings.rename}
        </Button>
      )}

      <BentoGrid columns={2} label={strings.detailsLabel}>
        <Tile as="section" aria-label={strings.baseUnitLabel}>
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
        </Tile>

        <Tile as="section" aria-label={strings.shelfLifeLabel}>
          <ShelfLifeEditor days={ingredient.shelfLifeDays} onSave={(days) => void attempt(() => ing.setShelfLife(days))} />
        </Tile>

        <Tile as="section" span="full" aria-label={strings.conversionsTitle}>
          <ConversionEditor
            conversions={ingredient.conversions}
            base={ingredient.baseUnit}
            system={system}
            onAdd={(c) => void attempt(() => ing.setConversion(c))}
            onRemove={(unit) => void attempt(() => ing.removeConversion(unit))}
          />
        </Tile>

        <IngredientProducts ingredientId={id} ingredientName={ingredient.name} baseUnit={ingredient.baseUnit} system={system} />

        <Tile as="section" aria-label={strings.mergeTitle}>
          <Button variant="tertiary" onClick={() => setMergeOpen(true)}>
            {strings.mergeInto}
          </Button>
        </Tile>

        <Tile as="section" aria-label={strings.deleteIngredient}>
          <Button variant="danger-tertiary" disabled={locked} onClick={() => setDeleteOpen(true)}>
            {strings.deleteIngredient}
          </Button>
          {locked ? <p>{strings.deleteLocked(ing.referenceCount)}</p> : null}
        </Tile>
      </BentoGrid>

      <MergeSheet
        open={mergeOpen}
        sourceId={id}
        onClose={() => setMergeOpen(false)}
        onMerged={(targetId) => {
          setMergeOpen(false)
          navigate(`/ingredients/${targetId}`)
        }}
      />
      <BottomSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={strings.deleteIngredient}>
        <p>{strings.deleteConfirm(ingredient.name)}</p>
        <Button onClick={() => void remove()}>{strings.deleteIngredient}</Button>
      </BottomSheet>
    </section>
  )
}
