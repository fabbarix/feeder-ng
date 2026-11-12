// Settings > Tags: the sheet, Save (add, rename, recolour, rename-onto-another), Merge into…, Delete and the focus after each.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ApiError } from '../../../lib/http'
import { colourCounts, nextColour, useTags, type DeleteSummary, type MergeSummary, type Tag, type TagPatch } from '../../../lib/tags'
import { useConfirm, useToast } from '../../../ui'
import { checkTagName } from '../lib/tagName'
import { mergeConfirmCopy, deleteConfirmCopy } from '../lib/confirmCopy'
import { focusAfterRemoval } from '../lib/focus'
import { tagsStrings } from '../strings'
import type { MergePickerState, SaveResult, SheetState, TagFormValues } from '../types'
import { useTagActions } from './useTagActions'

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

/** Where focus should go once the overlays have closed: a Tag's row, or Add Tag (id null). */
interface FocusTarget {
  id: number | null
}

/** The id of the Tag a 409 `tag_name_taken` names, when the server sent it. */
function takenTag(error: ApiError): { id: number; name: string } | undefined {
  const tag = error.details['tag'] as { id?: unknown; name?: unknown } | undefined
  return tag && typeof tag.id === 'number' && typeof tag.name === 'string' ? { id: tag.id, name: tag.name } : undefined
}

export function useTagsPage(): TagsPage {
  const { tags, isLoading, isError } = useTags()
  const actions = useTagActions()
  const toast = useToast()
  const confirm = useConfirm()
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [mergePicker, setMergePicker] = useState<MergePickerState | null>(null)
  const [busy, setBusy] = useState(false)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const newColour = useMemo(() => nextColour(colourCounts(tags)), [tags])

  // Runs once the Tag's row exists (a refetch may land later); clears the target once focus has gone there.
  useEffect(() => {
    if (!focusTarget) return
    if (focusTarget.id === null) {
      addRef.current?.focus()
      setFocusTarget(null)
      return
    }
    const row = listRef.current?.querySelector<HTMLElement>(`[data-tag-id="${focusTarget.id}"] .list-row__target`)
    if (row) {
      row.focus()
      setFocusTarget(null)
    }
  }, [focusTarget, tags])

  /** The merge: the summary is read, the User is asked, then the Tag is merged. Keeps the sheet and dialog on any refusal. */
  const mergeFlow = async (source: Tag, target: Pick<Tag, 'id' | 'name'>): Promise<SaveResult> => {
    let summary: MergeSummary
    setBusy(true)
    try {
      summary = await actions.mergeSummaryFor(source, target)
    } catch {
      setBusy(false)
      toast.show(tagsStrings.errors.impactFailed, { status: 'error' })
      return { ok: false }
    }
    setBusy(false)
    const copy = mergeConfirmCopy(summary)
    const choice = await confirm.choose({ title: copy.title, body: copy.body, confirmLabel: tagsStrings.merge.confirm })
    if (choice !== 'confirm') return { ok: false }
    const order = tags.map((t) => t.id)
    setBusy(true)
    try {
      await actions.merge(source.id, target.id)
    } catch {
      setBusy(false)
      toast.show(tagsStrings.errors.mergeFailed, { status: 'error' })
      return { ok: false }
    }
    setBusy(false)
    setSheet(null)
    setMergePicker(null)
    toast.show(tagsStrings.toasts.merged(source.name, target.name), { status: 'success' })
    setFocusTarget({ id: focusAfterRemoval(order, source.id) })
    return { ok: true }
  }

  /** A write the server refused or failed: a taken name or a bad name is shown under Name; anything else is a Toast. */
  const refused = (error: unknown, name: string, editing: Tag | null): Promise<SaveResult> | SaveResult => {
    if (error instanceof ApiError) {
      if (error.status === 409 && error.code === 'tag_name_taken') {
        const other = takenTag(error)
        if (editing && other) return mergeFlow(editing, other)
        return { ok: false, error: tagsStrings.errors.taken(other?.name ?? name) }
      }
      if (error.status === 422 && error.details['field'] === 'name') return { ok: false, error: tagsStrings.errors.invalid }
    }
    toast.show(tagsStrings.errors.saveFailed, { status: 'error' })
    return { ok: false }
  }

  const save = async (values: TagFormValues): Promise<SaveResult> => {
    const editing = sheet?.mode === 'edit' ? sheet.tag : null
    const check = checkTagName(values.name, tags, editing?.id)
    if (!check.ok) {
      if (check.reason !== 'taken') return { ok: false, error: check.message }
      return editing ? mergeFlow(editing, check.other) : { ok: false, error: check.message }
    }
    const name = check.name
    try {
      if (!editing) {
        const created = await actions.create({ name, colour: values.colour })
        setSheet(null)
        toast.show(tagsStrings.toasts.added(name), { status: 'success' })
        setFocusTarget({ id: created.id })
        return { ok: true }
      }
      const patch: TagPatch = {}
      if (name !== editing.name) patch.name = name
      if (values.colour !== editing.colour) patch.colour = values.colour
      if (Object.keys(patch).length === 0) {
        setSheet(null)
        return { ok: true }
      }
      await actions.update(editing.id, patch)
      setSheet(null)
      toast.show(patch.name !== undefined ? tagsStrings.toasts.renamed(name) : tagsStrings.toasts.saved(name), { status: 'success' })
      setFocusTarget({ id: editing.id })
      return { ok: true }
    } catch (error) {
      return refused(error, name, editing)
    }
  }

  const deleteTag = async (): Promise<void> => {
    const tag = sheet?.mode === 'edit' ? sheet.tag : null
    if (!tag) return
    let summary: DeleteSummary
    setBusy(true)
    try {
      summary = await actions.deleteSummaryFor(tag)
    } catch {
      setBusy(false)
      toast.show(tagsStrings.errors.impactFailed, { status: 'error' })
      return
    }
    setBusy(false)
    const copy = deleteConfirmCopy(summary)
    const choice = await confirm.choose({
      title: copy.title,
      body: copy.body,
      confirmLabel: tagsStrings.del.confirm,
      alternateLabel: tagsStrings.del.alternate,
      tone: 'danger',
    })
    if (choice === 'alternate') {
      setMergePicker({ source: tag, targetId: null })
      return
    }
    if (choice !== 'confirm') return
    const order = tags.map((t) => t.id)
    setBusy(true)
    try {
      await actions.remove(tag.id)
    } catch {
      setBusy(false)
      toast.show(tagsStrings.errors.deleteFailed, { status: 'error' })
      return
    }
    setBusy(false)
    setSheet(null)
    toast.show(tagsStrings.toasts.deleted(tag.name), { status: 'success' })
    setFocusTarget({ id: focusAfterRemoval(order, tag.id) })
  }

  const reviewMerge = async (): Promise<void> => {
    if (!mergePicker || mergePicker.targetId === null) return
    const target = tags.find((t) => t.id === mergePicker.targetId)
    if (!target) return
    const result = await mergeFlow(mergePicker.source, target)
    if (result.ok) setMergePicker(null)
  }

  return {
    tags,
    isLoading,
    isError,
    sheet,
    openNew: () => setSheet({ mode: 'new' }),
    openEdit: (tag) => setSheet({ mode: 'edit', tag }),
    closeSheet: () => setSheet(null),
    newColour,
    save,
    mergePicker,
    openMergePicker: () => {
      if (sheet?.mode === 'edit') setMergePicker({ source: sheet.tag, targetId: null })
    },
    setMergeTarget: (id) => setMergePicker((picker) => (picker ? { ...picker, targetId: id } : picker)),
    closeMergePicker: () => setMergePicker(null),
    reviewMerge,
    deleteTag,
    busy,
    listRef,
    addRef,
  }
}

