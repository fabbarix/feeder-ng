// Settings > Tags: the sheet, Save (add, rename, recolour, rename-onto-another), Merge into…, Delete and the focus after each.
import type { RefObject } from 'react'
import type { Tag } from '../../../lib/tags'
import type { MergePickerState, SaveResult, SheetState, TagFormValues } from '../types'

export interface TagsPage {
  /** By name (useTags). */
  tags: Tag[]
  isLoading: boolean
  isError: boolean
  sheet: SheetState | null
  openNew: () => void
  openEdit: (tag: Tag) => void
  closeSheet: () => void
  /** The colour a new Tag starts with: nextColour(colourCounts(tags)). */
  newColour: string
  /** Save the open sheet. See the design note, "Save". */
  save: (values: TagFormValues) => Promise<SaveResult>
  mergePicker: MergePickerState | null
  /** From the sheet's Merge into…: needs an edit sheet. */
  openMergePicker: () => void
  setMergeTarget: (id: number) => void
  closeMergePicker: () => void
  /** Review merge: load the summary, ask, merge. Does nothing until a target is chosen. */
  reviewMerge: () => Promise<void>
  /** From the sheet's Delete Tag: load the impact, ask (Delete, Merge instead, Cancel), delete. */
  deleteTag: () => Promise<void>
  /** True while a merge or delete is being loaded or written. */
  busy: boolean
  /** Wraps the rows; focus goes to a row's target inside it. */
  listRef: RefObject<HTMLDivElement | null>
  /** The Add Tag button. */
  addRef: RefObject<HTMLButtonElement | null>
}

export function useTagsPage(): TagsPage {
  throw new Error('TG-S: not implemented')
}
