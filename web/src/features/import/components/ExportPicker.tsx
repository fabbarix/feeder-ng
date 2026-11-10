import type { ReactNode } from 'react'
import { Checkbox, ListGroup, ListRow, RecipeThumb, Switch, Tile } from '../../../ui'
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
}

/**
 * The Recipes to export: an "All Recipes" Switch (selects all or clears), one ListRow per Recipe with its thumbnail and
 * a Checkbox named after it, and the download link (importStrings.exportSelected(n), or exportAll when everything is
 * picked; absent while nothing is selected). importStrings.noRecipes when the list is empty.
 */
export function ExportPicker({ recipes, selected, onToggle, onSelectAll, onClear, href }: ExportPickerProps): ReactNode {
  if (recipes.length === 0) {
    return (
      <Tile as="section">
        <p>{s.noRecipes}</p>
      </Tile>
    )
  }
  const everything = allSelected(
    recipes.map((r) => r.id),
    selected,
  )
  return (
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
      {href ? (
        <a className="import-link-button" href={href}>
          {everything ? s.exportAll : s.exportSelected(selected.length)}
        </a>
      ) : null}
    </Tile>
  )
}
