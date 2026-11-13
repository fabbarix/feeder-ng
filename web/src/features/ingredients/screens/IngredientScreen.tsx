import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { ApiError } from '../../../lib/http'
import { BentoGrid, BottomSheet, Button, CROP_ASPECTS, Chip, EmptyState, ImagePicker, PageHeader, TextField, Tile } from '../../../ui'
import { IngredientProducts } from '../../products'
import { IngredientExclusionList } from '../../recipes/components/IngredientExclusionList'
import { BaseUnitPicker } from '../components/BaseUnitPicker'
import { ConversionEditor } from '../components/ConversionEditor'
import { KindTile } from '../components/KindTile'
import { MergeSheet } from '../components/MergeSheet'
import { RestockLevelTile } from '../components/RestockLevelTile'
import { ShelfLifeEditor } from '../components/ShelfLifeEditor'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useIngredient } from '../hooks/useIngredient'
import { useKindChange } from '../hooks/useKindChange'
import { errorMessage } from '../lib/errorMessage'
import { kindBasePath, kindOf, wordsFor } from '../lib/kind'
import { displayName } from '../lib/names'
import { strings } from '../strings'
import type { IngredientKind } from '../types'

/**
 * Route /ingredients/:id (food, the default) and /supplies/:id (kind "supply"). Heading = name; "Rename" (inline Name field + "Save name").
 * Below it a BentoGrid of Tiles: Base Unit (BaseUnitPicker; a read-only value while referenced), then for food Shelf Life and Frozen Shelf
 * Life, for a Supply Restock level (RestockLevelTile); Picture, Unit Conversions, Products, for food Excluded by, then the Kind Tile
 * (changing kind; a Supply asks first), Merge and Delete. An Ingredient opened under the other kind's route is sent to its own page.
 */
export function IngredientScreen({ kind = 'food' }: { kind?: IngredientKind }) {
  const { id: rawId } = useParams()
  const id = Number(rawId)
  const navigate = useNavigate()
  const system = useDisplayUnitSystem()
  const ing = useIngredient(id)
  const change = useKindChange(ing.setKind, (target) => navigate(`${kindBasePath(target)}/${id}`, { replace: true }))
  const words = wordsFor(kind)

  const [renaming, setRenaming] = useState(false)
  const [nameText, setNameText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const ingredient = ing.ingredient
  const breadcrumbs = useBreadcrumbs(ingredient && displayName(ingredient.name))
  if (!ingredient) {
    if (ing.isLoading) return <p role="status">{strings.loading}</p>
    if (ing.error instanceof ApiError && ing.error.status === 404) {
      return (
        <section>
          <PageHeader title={breadcrumbs.at(-1)?.label ?? ''} breadcrumbs={breadcrumbs} />
          <EmptyState title={words.notFoundTitle} />
        </section>
      )
    }
    return <p role="alert">{strings.actionFailed}</p>
  }

  const actualKind = kindOf(ingredient)
  if (actualKind !== kind) return <Navigate to={`${kindBasePath(actualKind)}/${id}`} replace />

  const locked = ing.referenceCount > 0
  const isFood = kind === 'food'

  /** Runs a change, showing its failure inline. Resolves to true when it went through. */
  const attempt = async (run: () => Promise<unknown>): Promise<boolean> => {
    setError(null)
    try {
      await run()
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
    if (await attempt(() => ing.remove())) navigate(kindBasePath(kind))
  }

  return (
    <section>
      <PageHeader title={displayName(ingredient.name)} breadcrumbs={breadcrumbs} />
      {error ? <p role="alert">{error}</p> : null}

      {ingredient.baseRecipe ? (
        <p className="ingredient__base">
          <Chip kind="tag" icon="cook">
            {ingredient.baseRecipe.archived ? strings.baseRecipeArchived : strings.baseRecipeBadge}
          </Chip>{' '}
          <Link to={`/recipes/${ingredient.baseRecipe.id}`} aria-label={strings.openBaseRecipe(ingredient.baseRecipe.name)}>
            {ingredient.baseRecipe.name}
          </Link>
        </p>
      ) : null}

      {ingredient.baseRecipe ? (
        <p className="ingredient__helper">{strings.renameBaseRecipe}</p>
      ) : renaming ? (
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

      <BentoGrid min="card" label={strings.detailsLabel}>
        <Tile as="section" className="ingredient__tile" aria-label={strings.baseUnitLabel}>
          {locked ? (
            <>
              <div className="base-unit__value" data-testid="base-unit-value">
                <span className="base-unit__label">{strings.baseUnitLabel}</span>
                <span aria-hidden="true">{' · '}</span>
                <strong>{ingredient.baseUnit}</strong>
              </div>
              <p className="base-unit__helper">{strings.baseUnitLocked(ing.referenceCount)}</p>
            </>
          ) : (
            <BaseUnitPicker
              value={ingredient.baseUnit}
              onChange={(b) => {
                if (b !== ingredient.baseUnit) void attempt(() => ing.setBaseUnit(b))
              }}
            />
          )}
        </Tile>

        {isFood ? (
          <>
            <Tile as="section" className="ingredient__tile" aria-label={strings.shelfLifeTile}>
              <ShelfLifeEditor days={ingredient.shelfLifeDays} onSave={(days) => void attempt(() => ing.setShelfLife(days))} />
            </Tile>

            <Tile as="section" className="ingredient__tile" aria-label={strings.frozenShelfLifeLabel}>
              <ShelfLifeEditor
                variant="frozen"
                days={ingredient.frozenShelfLifeDays ?? null}
                onSave={(days) => void attempt(() => ing.setFrozenShelfLife(days))}
              />
            </Tile>
          </>
        ) : (
          <RestockLevelTile
            level={ingredient.restockLevel ?? null}
            baseUnit={ingredient.baseUnit}
            system={system}
            onSave={(level) => void attempt(() => ing.setRestockLevel(level))}
          />
        )}

        <Tile as="section" span="full" aria-labelledby="ingredient-picture-heading">
          <h2 id="ingredient-picture-heading">{strings.pictureLabel}</h2>
          <ImagePicker
            hideLabel
            label={strings.pictureLabel}
            value={ingredient.image ?? ''}
            onChange={(imageId) => void attempt(() => ing.setImage(imageId))}
            aspect={CROP_ASPECTS.landscape}
          />
        </Tile>

        <Tile as="section" span="full" aria-label={strings.conversionsTitle}>
          <ConversionEditor
            conversions={ingredient.conversions}
            base={ingredient.baseUnit}
            system={system}
            lockedUnits={ingredient.baseRecipe ? ['batch', 'portion'] : undefined}
            onAdd={(c) => void attempt(() => ing.setConversion(c))}
            onRemove={(unit) => void attempt(() => ing.removeConversion(unit))}
          />
        </Tile>

        <IngredientProducts ingredientId={id} ingredientName={ingredient.name} baseUnit={ingredient.baseUnit} system={system} />

        {isFood ? (
          <Tile as="section" id="exclusions" span="full" aria-label={strings.excludedBy}>
            <h2>{strings.excludedBy}</h2>
            <IngredientExclusionList ingredientId={id} ingredientName={ingredient.name} />
          </Tile>
        ) : null}

        <KindTile kind={kind} name={ingredient.name} change={change} />

        <Tile as="section" aria-label={strings.mergeTitle}>
          <Button variant="tertiary" onClick={() => setMergeOpen(true)}>
            {words.mergeInto}
          </Button>
        </Tile>

        <Tile as="section" aria-label={words.deleteLabel}>
          <Button variant="danger-tertiary" disabled={locked} onClick={() => setDeleteOpen(true)}>
            {words.deleteLabel}
          </Button>
          {locked ? <p>{strings.deleteLocked(ing.referenceCount)}</p> : null}
        </Tile>
      </BentoGrid>

      {mergeOpen ? (
        <MergeSheet
          open
          sourceId={id}
          kind={kind}
          onClose={() => setMergeOpen(false)}
          onMerged={(targetId) => {
            setMergeOpen(false)
            navigate(`${kindBasePath(kind)}/${targetId}`)
          }}
        />
      ) : null}
      <BottomSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={words.deleteLabel}>
        <p>{strings.deleteConfirm(ingredient.name)}</p>
        <Button onClick={() => void remove()}>{words.deleteLabel}</Button>
      </BottomSheet>
    </section>
  )
}
