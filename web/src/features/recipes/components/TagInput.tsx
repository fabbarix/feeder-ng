import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Chip } from '../../../ui'
import { addTag, removeTag } from '../lib/tags'
import { recipeStrings } from '../strings'

export interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
}

/** Tags of the Recipe as Chips (tap to remove) and an input; Enter or a comma adds the typed Tag. */
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
    <div>
      {tags.map((t) => (
        <Chip key={t} onClick={() => onChange(removeTag(tags, t))}>
          {t}
        </Chip>
      ))}
      <label>
        {recipeStrings.fields.tagInput}
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={commit} />
      </label>
    </div>
  )
}
