import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { ApiError } from '../../../lib/http'
import { BentoGrid, CROP_ASPECTS, Chip, ConfirmDialog, EmptyState, ErrorState, IconButton, ImagePicker, LoadState, Menu, PageHeader, Tile, useLeaveGuard, type MenuEntry } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { IngredientProducts } from '../../products'
import { IngredientExclusionList } from '../../recipes/components/IngredientExclusionList'
import { ConversionEditor } from '../components/ConversionEditor'
import { KeepingTile } from '../components/KeepingTile'
import { KindDialogs } from '../components/KindDialogs'
import { MergeSheet } from '../components/MergeSheet'
import { RenameSheet } from '../components/RenameSheet'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useIngredient, type UseIngredient } from '../hooks/useIngredient'
import { useIngredientPage } from '../hooks/useIngredientPage'
import { useKeepingForm } from '../hooks/useKeepingForm'
import { useKindChange } from '../hooks/useKindChange'
import { kindBasePath, kindOf, wordsFor } from '../lib/kind'
import { displayName } from '../lib/names'
import { strings } from '../strings'
import type { IngredientDetail, IngredientKind } from '../types'

/**
 * Route /ingredients/:id (food, the default) and /supplies/:id (kind "supply"). SET-05: the header holds the name, "Food" or
 * "Supply", and two outline IconButtons: Rename (a sheet) and More (Merge, Change kind, Delete). Below, a BentoGrid: Keeping (one
 * tile, one Save) first and full width, then Products and Unit Conversions as a pair (the render's order), then (food) Exclusions and the Picture, full
 * width. An Ingredient opened under the other kind's route is sent to its own page.
 */
export function IngredientScreen({ kind = 'food' }: { kind?: IngredientKind }) {
  const { id: rawId } = useParams()
  const id = Number(rawId)
  const ing = useIngredient(id)
  const words = wordsFor(kind)
  const ingredient = ing.ingredient
  const breadcrumbs = useBreadcrumbs(ingredient && displayName(ingredient.name))
  if (!ingredient) {
    // B9-20 (RES-02): offline and never loaded is a LoadState; a 404 says so; another failure offers Try again.
    if (ing.state === 'loading') return <p role="status">{strings.loading}</p>
    const notFound = ing.error instanceof ApiError && ing.error.status === 404
    return (
      <section>
        <PageHeader title={breadcrumbs.at(-1)?.label ?? ''} breadcrumbs={breadcrumbs} />
        {ing.state === 'offlineUnknown' ? (
          <LoadState title={words.offlineItemTitle} text={strings.offlineItemText} />
        ) : notFound ? (
          <EmptyState title={words.notFoundTitle} />
        ) : (
          <ErrorState message={words.itemError} onRetry={ing.refetch} />
        )}
      </section>
    )
  }
  const actualKind = kindOf(ingredient)
  if (actualKind !== kind) return <Navigate to={`${kindBasePath(actualKind)}/${id}`} replace />
  return <IngredientPage key={id} id={id} kind={kind} ing={ing} ingredient={ingredient} breadcrumbs={breadcrumbs} />
}

interface IngredientPageProps {
  id: number
  kind: IngredientKind
  ing: UseIngredient
  ingredient: IngredientDetail
  breadcrumbs: ReturnType<typeof useBreadcrumbs>
}

/** The loaded page. */
function IngredientPage({ id, kind, ing, ingredient, breadcrumbs }: IngredientPageProps) {
  const navigate = useNavigate()
  const system = useDisplayUnitSystem()
  const words = wordsFor(kind)
  const title = displayName(ingredient.name)
  const keeping = useKeepingForm(ingredient, ing.save)
  const guard = useLeaveGuard(keeping.dirty, { what: title })
  const page = useIngredientPage(ing, kind, id, () => guard.bypass(() => navigate(kindBasePath(kind))))
  const change = useKindChange(ing.setKind, (target) => guard.bypass(() => navigate(`${kindBasePath(target)}/${id}`, { replace: true })))
  const isFood = kind === 'food'
  const locked = ing.referenceCount > 0

  const more: MenuEntry[] = [
    { id: 'merge', label: words.mergeInto, onSelect: () => page.open('merge') },
    {
      id: 'kind',
      label: isFood ? strings.kind.changeToSupply : strings.kind.changeToFood,
      onSelect: () => change.request(isFood ? 'supply' : 'food'),
    },
    { separator: true },
    { id: 'delete', label: words.deleteLabel, tone: 'danger', disabled: locked, onSelect: () => page.open('delete') },
  ]

  return (
    <section>
      <PageHeader
        title={title}
        subtitle={isFood ? strings.kind.food : strings.kind.supply}
        breadcrumbs={breadcrumbs}
        actions={
          <>
            {ingredient.baseRecipe ? null : (
              <IconButton icon="edit" label={strings.header.rename(title)} aria-haspopup="dialog" onClick={() => page.open('rename')} />
            )}
            <Menu label={strings.header.more(title)} items={more} busy={page.deletePending} />
          </>
        }
      />
      <FormError>{page.failure ?? change.failure}</FormError>

      {ingredient.baseRecipe ? (
        <>
          <p className="ingredient__base">
            <Chip kind="tag" icon="cook">
              {ingredient.baseRecipe.archived ? strings.baseRecipeArchived : strings.baseRecipeBadge}
            </Chip>{' '}
            <Link to={`/recipes/${ingredient.baseRecipe.id}`} aria-label={strings.openBaseRecipe(ingredient.baseRecipe.name)}>
              {ingredient.baseRecipe.name}
            </Link>
          </p>
          <p className="ingredient__helper">{strings.renameBaseRecipe}</p>
        </>
      ) : null}

      <div className="ingredient__tiles">
        <BentoGrid min="card" label={words.detailsLabel}>
          <KeepingTile kind={kind} name={ingredient.name} form={keeping} referenceCount={ing.referenceCount} system={system} />

          <IngredientProducts
            ingredientId={id}
            ingredientName={ingredient.name}
            baseUnit={ingredient.baseUnit}
            system={system}
            span={1}
            className="ingredient__tile"
          />

          <Tile as="section" className="ingredient__tile" aria-label={strings.conversionsTitle}>
            <ConversionEditor
              conversions={ingredient.conversions}
              base={ingredient.baseUnit}
              system={system}
              lockedUnits={ingredient.baseRecipe ? ['batch', 'portion'] : undefined}
              onAdd={(c) => ing.setConversion(c)}
              onRemove={(unit) => void page.removeConversion(unit)}
            />
          </Tile>

          {isFood ? (
            <Tile as="section" id="exclusions" span="full" aria-label={strings.excludedBy}>
              <h2>{strings.excludedBy}</h2>
              <IngredientExclusionList ingredientId={id} ingredientName={ingredient.name} />
            </Tile>
          ) : null}

          <Tile as="section" span="full" aria-labelledby="ingredient-picture-heading">
            <h2 id="ingredient-picture-heading">{strings.pictureLabel}</h2>
            <ImagePicker
              hideLabel
              label={strings.pictureLabel}
              value={ingredient.image ?? ''}
              onChange={(imageId) => void page.attempt(() => ing.setImage(imageId))}
              aspect={CROP_ASPECTS.landscape}
            />
          </Tile>
        </BentoGrid>
      </div>

      <RenameSheet open={page.sheet === 'rename'} kind={kind} name={ingredient.name} onClose={page.close} onSave={ing.rename} />
      {page.sheet === 'merge' ? (
        <MergeSheet
          open
          sourceId={id}
          kind={kind}
          onClose={page.close}
          onMerged={(targetId) => {
            page.close()
            guard.bypass(() => navigate(`${kindBasePath(kind)}/${targetId}`))
          }}
        />
      ) : null}
      <ConfirmDialog open={page.deleteOpen} {...page.deleteOptions} onConfirm={() => void page.confirmDelete()} onCancel={page.close} />
      <KindDialogs kind={kind} name={ingredient.name} change={change} />
    </section>
  )
}
