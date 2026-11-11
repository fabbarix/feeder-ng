import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Chip, TextField } from '../../../ui'
import { addTag, removeTag } from '../lib/tags'
import { recipeStrings } from '../strings'

export interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
}

/** Tags of the Recipe as filter Chips (tap one to remove it) and a text field on one line: Enter, a comma or leaving the field adds the typed Tag; Backspace in the empty field removes the last one. */
export function TagInput({ tags, onChange }: TagInputProps): ReactNode {
  const [text, setText] = useState('')

  const commit = () => {
    onChange(addTag(tags, text))
    setText('')
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && text === '' && tags.length > 0) {
      // Backspace in the empty field takes back the last Tag.
      onChange(removeTag(tags, tags[tags.length - 1]!))
    }
  }

  return (
    <div className="tag-input" role="group" aria-label={recipeStrings.fields.tags} data-size="md">
      <div className="tag-input__control">
        {tags.map((t) => (
          <Chip key={t} kind="filter" selected onClick={() => onChange(removeTag(tags, t))}>
            {t}
          </Chip>
        ))}
        <TextField size="full" label={recipeStrings.fields.tagInput} value={text} onChange={setText} onKeyDown={onKey} onBlur={commit} />
      </div>
    </div>
  )
}
