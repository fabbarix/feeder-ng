import { useId, useState } from 'react'
import { scanStrings } from '../strings'
import type { IngredientChoice } from '../lib/unknownForm'

export interface IngredientComboboxProps {
  ingredients: IngredientChoice[]
  selected: IngredientChoice | null
  /** a picked Ingredient, or a new one to create (no id) */
  onSelect: (choice: IngredientChoice | null) => void
}

/** Searchable Ingredient field: typing filters the list; a name that matches none offers to create it. */
export function IngredientCombobox({ ingredients, selected, onSelect }: IngredientComboboxProps) {
  const id = useId()
  const [text, setText] = useState(selected?.name ?? '')
  const query = text.trim()
  const lower = query.toLowerCase()
  const matches = query === '' ? [] : ingredients.filter((i) => i.name.toLowerCase().includes(lower))
  const exact = ingredients.some((i) => i.name.toLowerCase() === lower)
  const showing = query !== '' && !(selected && selected.name === text)
  const listId = `${id}-options`

  return (
    <div className="combobox">
      <label className="field__label" htmlFor={`${id}-input`}>
        {scanStrings.ingredient}
      </label>
      <input
        id={`${id}-input`}
        role="combobox"
        aria-label={scanStrings.ingredient}
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        className="field__input"
        value={text}
        placeholder={scanStrings.ingredientSearch}
        onChange={(e) => {
          setText(e.target.value)
          onSelect(null)
        }}
      />
      {showing ? (
        <ul id={listId} role="listbox" className="combobox__options">
          {matches.map((i) => (
            <li
              key={i.id ?? i.name}
              role="option"
              aria-selected={selected?.id === i.id}
              tabIndex={-1}
              onClick={() => {
                setText(i.name)
                onSelect(i)
              }}
            >
              {i.name}
            </li>
          ))}
          {!exact ? (
            <li
              role="option"
              aria-selected={false}
              tabIndex={-1}
              onClick={() => {
                setText(query)
                onSelect({ name: query, baseUnit: 'g' })
              }}
            >
              {scanStrings.createIngredient(query)}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
