import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Dialog, SearchField } from '../../../ui'
import { useBaseRecipePicker } from '../../../lib/baseRecipes/useBaseRecipePicker'
import type { LinkChoice } from '../../../lib/baseRecipes/useLineLink'
import { flatPickerRows, moveActive } from '../../../lib/baseRecipes/pickerKeys'
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
 * BR-D (design §3.7): a listbox sheet titled "Link to a Base recipe": the search field keeps the focus, the arrows move the active option (disabled
 * rows are skipped), Enter chooses it, Escape closes and the focus goes back to what opened it. Base recipes (exact match first), then the create row,
 * then the group "Recipes you plan" (choosing one calls onChoose with kind 'convert'; the hook asks the confirm).
 */
export function BaseRecipePicker(props: BaseRecipePickerProps): ReactNode {
  if (!props.open) return null
  return <PickerSheet {...props} />
}

function PickerSheet({ lineName, recipeId, onClose, onChoose }: BaseRecipePickerProps): ReactNode {
  const picker = useBaseRecipePicker({ recipeId, lineName })
  const t = recipeStrings.baseRecipe.picker
  const { rows } = picker
  const uid = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(-1)
  const flat = flatPickerRows(rows)

  // The focus goes back to what opened the picker when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    return () => opener?.focus()
  }, [])
  useEffect(() => setActive(-1), [picker.query])

  const choose = (row: PickerRow) => {
    if (row.kind === 'base') {
      if (!row.disabled) onChoose({ kind: 'existing', baseRecipe: { id: row.id, name: row.name } })
    } else if (row.kind === 'new') onChoose({ kind: 'new', name: row.name })
    else if (!row.disabled) onChoose({ kind: 'convert', recipe: { id: row.id, name: row.name } })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => moveActive(flat, a, e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter' && active >= 0 && flat[active]) {
      e.preventDefault()
      choose(flat[active]!)
    }
  }

  const optionId = (index: number) => `${uid}-option-${index}`
  let index = -1
  const option = (row: PickerRow, group: string) => {
    index += 1
    const i = index
    const isActive = i === active
    const common = {
      id: optionId(i),
      role: 'option' as const,
      'aria-selected': isActive,
      'aria-disabled': row.kind !== 'new' && row.disabled ? ('true' as const) : undefined,
      tabIndex: -1,
      className: 'picker-row',
      onClick: () => choose(row),
      onMouseEnter: () => setActive(i),
    }
    if (row.kind === 'new') {
      return (
        <div key={`${group}-${i}`} {...common} aria-label={row.label}>
          {row.label}
        </div>
      )
    }
    if (row.kind === 'base') {
      return (
        <div key={`${group}-${i}`} {...common} aria-label={`${row.name}, ${row.detail}`}>
          <span className="picker-row__name">{row.name}</span>
          <span className="picker-row__detail">{row.detail}</span>
          {row.reason ? <span className="picker-row__reason">{row.reason}</span> : null}
        </div>
      )
    }
    return (
      <div key={`${group}-${i}`} {...common} aria-label={row.name}>
        <span className="picker-row__name">{row.name}</span>
        {row.reason ? <span className="picker-row__reason">{row.reason}</span> : null}
      </div>
    )
  }

  const nothing = rows.base.length === 0 && rows.plannable.length === 0
  const baseRows = rows.base.map((r) => option(r, 'base'))
  const createRow = rows.create ? option(rows.create, 'create') : null
  const planRows = rows.plannable.map((r) => option(r, 'plan'))

  return (
    <Dialog open title={t.title} onClose={onClose} initialFocusRef={inputRef}>
      <SearchField
        ref={inputRef}
        label={t.search}
        value={picker.query}
        onChange={picker.setQuery}
        onKeyDown={onKeyDown}
        placeholder={t.search}
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
      />
      {picker.error ? <p className="line-row__hint">{picker.error}</p> : null}
      {picker.isLoading ? <p className="line-row__hint">{t.loading}</p> : null}
      <div role="listbox" id={`${uid}-list`} aria-label={t.title} className="picker-list">
        {baseRows}
        {createRow}
        {planRows.length > 0 ? (
          <div role="group" aria-label={t.group} className="picker-group">
            <p className="picker-group__label">{t.group}</p>
            {planRows}
          </div>
        ) : null}
      </div>
      {nothing && !picker.isLoading && !picker.error ? <p className="line-row__hint">{t.empty}</p> : null}
    </Dialog>
  )
}

