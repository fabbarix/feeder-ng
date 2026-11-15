import { useId, useState, type ReactNode } from 'react'
import { Button, Checkbox, EmptyState, FormActions, Icon, ListGroup, ListRow, RecipeThumb, SearchField, StickyActionBar, Tile } from '../../../ui'
import { alsoExportLabel } from '../lib/exportAlso'
import { EXPORT_SEARCH_FROM, searchRecipes, selectionState } from '../lib/exportSelection'
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

const t = s.exportBar

/**
 * B9-28 (RX-15): the Recipes to export. The tile "Choose Recipes" has a search field above 12 Recipes, a first row "All Recipes" with a
 * tri-state Checkbox (mixed while some are chosen) and its count, then one row per Recipe with its Checkbox as the leading control (the
 * whole row toggles). The Base recipes the export adds are named under the list. The "Export actions" bar is always there: the count as a
 * status and the primary download link, or a disabled "Export Recipes" described by "Choose at least one Recipe".
 */
export function ExportPicker({ recipes, selected, onToggle, onSelectAll, onClear, href, also = [] }: ExportPickerProps): ReactNode {
  const [query, setQuery] = useState('')
  const metaId = useId()
  if (recipes.length === 0) {
    return <EmptyState icon="recipes" title={s.noRecipes} />
  }
  const ids = recipes.map((r) => r.id)
  const state = selectionState(ids, selected)
  const chosen = ids.filter((id) => selected.includes(id)).length
  const shown = searchRecipes(recipes, query)
  const allMeta = state === 'none' ? t.chosenNone : state === 'all' ? t.chosenAll(ids.length) : t.chosenOf(chosen, ids.length)
  const toggleAll = () => (state === 'all' ? onClear() : onSelectAll())
  return (
    <>
      <Tile as="section" className="export-picker">
        <h2>{s.exportPick}</h2>
        {recipes.length >= EXPORT_SEARCH_FROM ? <SearchField label={t.search} placeholder={t.searchHint} value={query} onChange={setQuery} /> : null}
        <ListGroup label={s.exportPick}>
          <ListRow
            title={s.allRecipes}
            meta={allMeta}
            onActivate={toggleAll}
            control={
              <span className="export-picker__check">
                <Checkbox label={s.allRecipes} checked={state === 'all'} indeterminate={state === 'some'} onChange={toggleAll} />
              </span>
            }
            data-row="all"
          />
          {shown.map((r) => (
            <ListRow
              key={r.id}
              title={r.name}
              leading={<RecipeThumb name={r.name} photoUrl={r.imageUrl || undefined} size={40} />}
              onActivate={() => onToggle(r.id)}
              control={
                <span className="export-picker__check">
                  <Checkbox label={r.name} checked={selected.includes(r.id)} onChange={() => onToggle(r.id)} />
                </span>
              }
            />
          ))}
        </ListGroup>
        {shown.length === 0 ? <p className="export-picker__none">{t.noMatch}</p> : null}
        {also.length > 0 ? (
          <ul className="export-picker__also" aria-label={s.baseRecipes.alsoExports}>
            {also.map((b) => (
              <li key={b.id}>{alsoExportLabel(b.name)}</li>
            ))}
          </ul>
        ) : null}
      </Tile>
      <StickyActionBar label={s.exportActions}>
        <div className="export-bar">
          <p id={metaId} className="export-bar__meta" role="status">
            {href ? t.count(chosen, also.length) : t.chooseOne}
          </p>
          <FormActions
            primary={
              href ? (
                <a className="button" data-variant="primary" data-size="md" href={href}>
                  <Icon name="export" size={20} />
                  {t.exportCount(chosen)}
                </a>
              ) : (
                <Button icon="export" disabled aria-describedby={metaId}>
                  {t.exportNone}
                </Button>
              )
            }
          />
        </div>
      </StickyActionBar>
    </>
  )
}
