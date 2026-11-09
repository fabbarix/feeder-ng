import type { ReactNode } from 'react'
import { Button, Chip, Tile } from '../../../ui'
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

/** One selectable Chip per Recipe (aria-pressed), "Select all" and "Clear", and the download link labelled importStrings.exportSelected(n) (importStrings.exportAll when every Recipe is selected); the link is absent while nothing is selected. importStrings.noRecipes when the list is empty. */
export function ExportPicker({ recipes, selected, onToggle, onSelectAll, onClear, href }: ExportPickerProps): ReactNode {
  if (recipes.length === 0) {
    return <Tile as="section"><p>{s.noRecipes}</p></Tile>
  }
  const everything = allSelected(
    recipes.map((r) => r.id),
    selected,
  )
  return (
    <Tile size="wide" as="section" aria-label={s.exportPick}>
      <h2>{s.exportPick}</h2>
      <div>
        {recipes.map((r) => (
          <Chip key={r.id} selected={selected.includes(r.id)} onClick={() => onToggle(r.id)}>
            {r.name}
          </Chip>
        ))}
      </div>
      <div>
        <Button variant="ghost" onClick={onSelectAll}>{s.selectAll}</Button>
        <Button variant="ghost" onClick={onClear}>{s.clearSelection}</Button>
      </div>
      {href ? (
        <a className="button" data-variant="primary" href={href}>
          {everything ? s.exportAll : s.exportSelected(selected.length)}
        </a>
      ) : null}
    </Tile>
  )
}
