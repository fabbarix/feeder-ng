import type { ReactNode } from 'react'
import { Checkbox, EmptyState, FormActions, ListGroup, ListRow, RecipeThumb, StickyActionBar, Switch, Tile } from '../../../ui'
import { alsoExportLabel } from '../lib/exportAlso'
import { allSelected } from '../lib/exportSelection'
import { importStrings as s } from '../strings'
import type { ExportableRecipe } from '../types'

export interface ExportPickerProps {
  recipes: ExportableRecipe[]
  selected: number[]
  onToggle: (id: number) => void
  onSelectAll: () => void
  onClear: () => void
  /** Download address or null. */
  href: string | null
  /** BR-E: the Base recipes the export adds (useExportPicker.also); listed, never ticked. */
  also?: Array<{ id: number; name: string }>
}

/**
 * The Recipes to export: an "All Recipes" Switch (selects all or clears), one ListRow per Recipe with its thumbnail and
 * a Checkbox named after it, and the primary download action (importStrings.exportFile, styled as the shared primary
 * Button, the primary of a StickyActionBar "Export actions" after the Tile; absent while nothing is selected). An EmptyState
 * (importStrings.noRecipes) when the list is empty.
 */
export function ExportPicker({ recipes, selected, onToggle, onSelectAll, onClear, href, also = [] }: ExportPickerProps): ReactNode {
  if (recipes.length === 0) {
    return <EmptyState icon="recipes" title={s.noRecipes} />
  }
  const everything = allSelected(
    recipes.map((r) => r.id),
    selected,
  )
  return (
    <>
      <Tile as="section" className="export-picker">
        <h2>{s.exportPick}</h2>
        <Switch label={s.allRecipes} checked={everything} onChange={(on) => (on ? onSelectAll() : onClear())} />
        <ListGroup label={s.exportPick}>
          {recipes.map((r) => (
            <ListRow
              key={r.id}
              title={r.name}
              leading={<RecipeThumb name={r.name} photoUrl={r.imageUrl || undefined} size={40} />}
              onActivate={() => onToggle(r.id)}
              trailing={
                <span className="export-picker__check">
                  <Checkbox label={r.name} checked={selected.includes(r.id)} onChange={() => onToggle(r.id)} />
                </span>
              }
            />
          ))}
        </ListGroup>
        {also.length > 0 ? (
          <ul className="export-picker__also" aria-label={s.baseRecipes.alsoExports}>
            {also.map((b) => (
              <li key={b.id}>{alsoExportLabel(b.name)}</li>
            ))}
          </ul>
        ) : null}
      </Tile>
      {href ? (
        <StickyActionBar label={s.exportActions}>
          <FormActions
            primary={
              <a className="button" data-variant="primary" data-size="md" href={href}>
                {s.exportFile}
              </a>
            }
          />
        </StickyActionBar>
      ) : null}
    </>
  )
}
