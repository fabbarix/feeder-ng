import { useId, useRef, type ReactNode } from 'react'
import { Button, Chip, OptionList, Popover, TagDot } from '../../../ui'
import { tagColourStrings } from '../../../ui/TagColour/strings'
import { useTagChooser } from '../hooks/useTagChooser'
import { tagKey } from '../lib/keys'
import { recipeStrings } from '../strings'
import type { TagCount } from '../types'

export interface TagChooserProps {
  tags: string[]
  onChange: (tags: string[]) => void
  /** The Household's existing Tags. */
  known?: TagCount[]
  /** Tag name => colour id; undefined = a new Tag (a neutral chip with "New"). Itself undefined while the Tags load: no "New" yet. */
  colourOf?: (name: string) => string | undefined
}

const NO_TAGS: TagCount[] = []

/**
 * RX-09 (decision RX 6): the Recipe's Tags as removable Tag-colour chips plus "Add Tag", which opens the Tag chooser: the shared
 * OptionList (multiple, with an "Add Tag" create row) in the shared Popover, a sheet below 768 px and a popover from it. Choosing never
 * closes it; the chips update live. Renders and wires only (useTagChooser holds the state).
 */
export function TagChooser({ tags, onChange, known = NO_TAGS, colourOf }: TagChooserProps): ReactNode {
  const t = recipeStrings.fields.tagChooser
  const chooser = useTagChooser(tags, known, onChange)
  const addRef = useRef<HTMLButtonElement>(null)
  const labelId = useId()
  const panelId = useId()
  const close = () => {
    chooser.close()
    addRef.current?.focus()
  }
  const saved = new Set(known.map((k) => tagKey(k.name)))
  const options = chooser.rows.map((r) => ({
    value: r.name,
    label: r.name,
    // A Tag no one has saved yet says so; a saved Tag says how many Recipes carry it (0 too).
    meta: saved.has(tagKey(r.name)) ? tagColourStrings.recipes(r.recipes) : recipeStrings.newTag,
    leading: <TagDot colour={colourOf?.(r.name)} />,
  }))
  const emptyText = known.length === 0 && tags.length === 0 && chooser.query.trim() === '' ? t.empty : null
  return (
    <div className="tag-chooser">
      <span id={labelId} className="ui-field__label">
        {recipeStrings.fields.tags}
      </span>
      <div role="group" aria-labelledby={labelId} className="tag-chooser__chips">
        {tags.map((name) => {
          const colour = colourOf?.(name)
          const isNew = colourOf !== undefined && colour === undefined
          return (
            <Chip key={name} kind="tag" tagColour={colour} onRemove={() => chooser.remove(name)} removeLabel={recipeStrings.fields.removeTag(name)}>
              {isNew ? (
                <>
                  {name} <span className="tag-chooser__new">{recipeStrings.newTag}</span>
                </>
              ) : (
                name
              )}
            </Chip>
          )
        })}
        <Button ref={addRef} variant="secondary" size="sm" icon="add" aria-haspopup="dialog" aria-expanded={chooser.open} aria-controls={chooser.open ? panelId : undefined} onClick={chooser.show}>
          {t.add}
        </Button>
      </div>
      <Popover
        id={panelId}
        open={chooser.open}
        onClose={close}
        anchorRef={addRef}
        title={t.title}
        className="tag-chooser__panel"
        footer={
          <Button variant="secondary" size="sm" onClick={close}>
            {t.done}
          </Button>
        }
      >
        <div className="tag-chooser__body">
          <OptionList<string>
            label={t.list}
            searchLabel={t.search}
            query={chooser.query}
            onQueryChange={chooser.setQuery}
            options={options}
            selected={chooser.rows.filter((r) => r.chosen).map((r) => r.name)}
            onToggle={chooser.toggle}
            onCreate={chooser.create}
            createLabel={t.create}
            createMeta={t.createMeta}
            emptyText={emptyText}
            multiple
          />
          {tags.length > 0 ? <p className="tag-chooser__chosen">{t.chosen(tags.join(', '))}</p> : null}
        </div>
      </Popover>
    </div>
  )
}
