import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Chip, TextField } from '../../../ui'
import { addTag, removeTag } from '../lib/tags'
import { recipeStrings } from '../strings'

export interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
}

/** Tags of the Recipe as filter Chips (tap one to remove it) and a text field: Enter or a comma adds the typed Tag. */
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
    }
  }

  return (
    <div className="tag-input">
      {tags.length > 0 ? (
        <div className="tag-input__tags">
          {tags.map((t) => (
            <Chip key={t} kind="filter" selected onClick={() => onChange(removeTag(tags, t))}>
              {t}
            </Chip>
          ))}
        </div>
      ) : null}
      <TextField label={recipeStrings.fields.tagInput} value={text} onChange={setText} onKeyDown={onKey} onBlur={commit} />
    </div>
  )
}
