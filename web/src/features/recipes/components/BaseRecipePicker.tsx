import type { ReactNode } from 'react'
import { Dialog, SearchField } from '../../../ui'
import { useBaseRecipePicker } from '../../../lib/baseRecipes/useBaseRecipePicker'
import type { LinkChoice } from '../../../lib/baseRecipes/useLineLink'
import type { PickerRow } from '../../../lib/baseRecipes/types'
import { recipeStrings } from '../strings'

export interface BaseRecipePickerProps {
  open: boolean
  /** The line's Ingredient name ("béchamel"): ranks the rows and names the "new Base recipe" row. */
  lineName: string
  /** The Recipe being edited (left out; the Recipes that call for it are listed disabled). Undefined for an unsaved Recipe. */
  recipeId?: number
  onClose: () => void
  onChoose: (choice: LinkChoice) => void
}

/**
 * BR-D (design §3.7): a crafted sheet (BottomSheet/Dialog) titled "Link to a Base recipe": a search field, the Base recipes (name matches first, the exact match marked), then
 * "Add "Béchamel" as a new Base recipe", then the group "Recipes you plan" (choosing one calls onChoose with kind 'convert'; the hook asks the confirm). Disabled rows say why. A listbox of options; no native control.
 */
export function BaseRecipePicker(props: BaseRecipePickerProps): ReactNode {
  if (!props.open) return null
  return <PickerSheet {...props} />
}

function PickerSheet({ lineName, recipeId, onClose, onChoose }: BaseRecipePickerProps): ReactNode {
  const picker = useBaseRecipePicker({ recipeId, lineName })
  const t = recipeStrings.baseRecipe.picker
  const { rows } = picker

  const choose = (row: PickerRow) => {
    if (row.kind === 'base') {
      if (!row.disabled) onChoose({ kind: 'existing', baseRecipe: { id: row.id, name: row.name } })
    } else if (row.kind === 'new') onChoose({ kind: 'new', name: row.name })
    else if (!row.disabled) onChoose({ kind: 'convert', recipe: { id: row.id, name: row.name } })
  }

  const option = (row: PickerRow, key: string) => {
    if (row.kind === 'new') {
      return (
        <OptionRow key={key} label={row.label} onSelect={() => choose(row)}>
          {row.label}
        </OptionRow>
      )
    }
    if (row.kind === 'base') {
      return (
        <OptionRow key={key} label={`${row.name}, ${row.detail}`} disabled={row.disabled} onSelect={() => choose(row)}>
          <span className="picker-row__name">{row.name}</span>
          <span className="picker-row__detail">{row.detail}</span>
          {row.reason ? <span className="picker-row__reason">{row.reason}</span> : null}
        </OptionRow>
      )
    }
    return (
      <OptionRow key={key} label={row.name} disabled={row.disabled} onSelect={() => choose(row)}>
        <span className="picker-row__name">{row.name}</span>
        {row.reason ? <span className="picker-row__reason">{row.reason}</span> : null}
      </OptionRow>
    )
  }

  const nothing = rows.base.length === 0 && rows.plannable.length === 0 && rows.create === null

  return (
    <Dialog open title={t.title} onClose={onClose}>
      <SearchField label={t.search} value={picker.query} onChange={picker.setQuery} placeholder={t.search} />
      {picker.error ? <p className="line-row__hint">{picker.error}</p> : null}
      {picker.isLoading ? <p className="line-row__hint">{t.loading}</p> : null}
      <div role="listbox" aria-label={t.title} className="picker-list">
        {rows.base.map((row, i) => option(row, `base-${i}`))}
        {rows.create ? option(rows.create, 'create') : null}
        {rows.plannable.length > 0 ? (
          <div role="group" aria-label={t.group} className="picker-group">
            <p className="picker-group__label">{t.group}</p>
            {rows.plannable.map((row, i) => option(row, `plan-${i}`))}
          </div>
        ) : null}
      </div>
      {nothing && !picker.isLoading && !picker.error ? <p className="line-row__hint">{t.empty}</p> : null}
    </Dialog>
  )
}

function OptionRow({ label, disabled, onSelect, children }: { label: string; disabled?: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <div
      role="option"
      aria-selected={false}
      aria-disabled={disabled ? 'true' : undefined}
      aria-label={label}
      tabIndex={0}
      className="picker-row"
      onClick={() => onSelect()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      {children}
    </div>
  )
}
