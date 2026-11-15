// B9-37 (RX-09): the state of the Tag chooser: open or closed, the query, the rows it lists (lib/tagChooser), and what choosing a row,
// adding a new Tag and removing a chip do to the Recipe's Tags (lib/tags). No JSX; TagChooser renders it.
import { useState } from 'react'
import { chooserRows, type ChooserRow } from '../lib/tagChooser'
import { addTag, canonicalTag, removeTag } from '../lib/tags'
import { tagKey } from '../lib/keys'
import type { TagCount } from '../types'

export interface UseTagChooser {
  open: boolean
  show: () => void
  close: () => void
  query: string
  setQuery: (query: string) => void
  rows: ChooserRow[]
  /** A row chosen: added (in its saved spelling) when it is not on the Recipe, removed when it is. */
  toggle: (name: string) => void
  /** The create row (or Enter, or a comma, on words that are no Tag): adds them, in a known Tag's spelling if one matches. */
  create: (typed: string) => void
  /** A chip's remove. */
  remove: (name: string) => void
}

export function useTagChooser(tags: string[], known: readonly TagCount[], onChange: (tags: string[]) => void): UseTagChooser {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { rows } = chooserRows(known, tags, query)
  return {
    open,
    show: () => setOpen(true),
    close: () => {
      setOpen(false)
      setQuery('')
    },
    query,
    setQuery,
    rows,
    toggle: (name) => onChange(tags.some((t) => tagKey(t) === tagKey(name)) ? removeTag(tags, name) : addTag(tags, canonicalTag([...known], name))),
    create: (typed) => onChange(addTag(tags, canonicalTag([...known], typed))),
    remove: (name) => onChange(removeTag(tags, name)),
  }
}
