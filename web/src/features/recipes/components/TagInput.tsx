import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Chip, TagDot, TextField } from '../../../ui'
import { addTag, canonicalTag, removeTag, suggestTags } from '../lib/tags'
import { recipeStrings } from '../strings'
import type { TagCount } from '../types'

export interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  /** The Household's existing Tags, offered while typing so the same Tag is not made twice. */
  known?: TagCount[]
  /** TG-RW: Tag name => colour id; undefined = a new Tag (neutral chip marked "New"). */
  colourOf?: (name: string) => string | undefined
}

/**
 * Tags of the Recipe as filter Chips (tap one to remove it) and a text field on one line: Enter, a comma or leaving the
 * field adds the typed Tag; Backspace in the empty field removes the last one. While typing, existing Tags that match
 * are listed under the field (a combobox): arrows move through them, Enter or a tap picks one. A typed Tag that matches
 * an existing one in another spelling is saved with the existing spelling.
 */
export function TagInput({ tags, onChange, known = [], colourOf }: TagInputProps): ReactNode {
  const [text, setText] = useState('')
  const [active, setActive] = useState(-1)
  const captionId = useId()
  const listId = useId()
  const suggestions = suggestTags(known, tags, text)
  const open = suggestions.length > 0

  const add = (name: string) => {
    onChange(addTag(tags, canonicalTag(known, name)))
    setText('')
    setActive(-1)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setActive(-1)
      setText('')
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(active >= 0 && suggestions[active] ? suggestions[active].name : text)
    } else if (e.key === 'Backspace' && text === '' && tags.length > 0) {
      // Backspace in the empty field takes back the last Tag.
      onChange(removeTag(tags, tags[tags.length - 1]!))
    }
  }

  return (
    <div className="tag-input" role="group" aria-labelledby={captionId} data-size="md">
      <span id={captionId} className="ui-field__label tag-input__label">
        {recipeStrings.fields.tags}
      </span>
      <div className="tag-input__control" data-size-intent="inline">
        {tags.map((t) => (
          <Chip
            key={t}
            kind="filter"
            selected
            label={recipeStrings.fields.removeTag(t)}
            tagColour={colourOf?.(t)}
            onClick={() => onChange(removeTag(tags, t))}
          >
            {t}
            {colourOf && !colourOf(t) ? <span className="tag-input__new">{recipeStrings.newTag}</span> : null}
          </Chip>
        ))}
        <TextField
          size="full"
          label={recipeStrings.fields.tagInput}
          placeholder={recipeStrings.fields.tagInput}
          value={text}
          onChange={(v) => {
            setText(v)
            setActive(-1)
          }}
          onKeyDown={onKey}
          onBlur={() => add(text)}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
        />
      </div>
      <ul id={listId} className="tag-input__suggestions" role="listbox" aria-label={recipeStrings.fields.tagSuggestions} hidden={!open}>
        {suggestions.map((t, i) => (
          <li
            key={t.name}
            id={`${listId}-${i}`}
            role="option"
            aria-label={`${t.name} ${recipeStrings.fields.tagRecipes(t.recipes)}`}
            aria-selected={i === active}
            className="tag-input__suggestion"
            // mousedown, not click: the field's blur would add the typed text first.
            onMouseDown={(e) => {
              e.preventDefault()
              add(t.name)
            }}
          >
            <TagDot colour={colourOf?.(t.name)} />
            <span>{t.name}</span>
            <span className="tag-input__count">{recipeStrings.fields.tagRecipes(t.recipes)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
