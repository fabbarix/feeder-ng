// B9-31 (SAFE-01): the Recipe editor's reload and crash draft. It covers what the leave guard cannot block (a reload, a closed tab,
// a crash) and is never a substitute for the leave dialog: it is forgotten on Save, on Discard changes and on Cancel. It wraps
// lib/drafts (draftStore, draftDecision, draftCopy, draftWriter) and reports the unsaved flag that holds the update prompt.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMe } from '../../../app/useMe'
import { useReportUnsavedChanges } from '../../../app/unsavedChanges'
import { decideDraft, type DraftDecision, type DraftRecord } from '../../../lib/drafts/draftDecision'
import { draftActionLabel, draftNotice } from '../../../lib/drafts/draftCopy'
import { draftKey, openDraftStore, type DraftStore } from '../../../lib/drafts/draftStore'
import { createDraftWriter, type DraftWriter } from '../../../lib/drafts/draftWriter'
import { useConfirm, type DraftNoticeProps } from '../../../ui'
import type { RecipeDraft } from '../lib/draft'
import { discardDialog } from '../lib/editorExit'

export interface UseRecipeDraftOptions {
  /** Undefined: a new Recipe (key "<userId>:new"). */
  recipeId?: number
  /** useRecipeEditor.ready: nothing is read or written before it. */
  ready: boolean
  draft: RecipeDraft
  dirty: boolean
  storedUpdatedAt: string | null
  /** The discard dialog's "Your changes to <what>". */
  what: string
  restore: (draft: RecipeDraft) => void
  reset: () => void
  /** False when an uploaded Photo was swept (24 h orphan grace). A check that fails keeps the Photo. */
  imageExists?: (id: string) => Promise<boolean>
}

export interface UseRecipeDraft {
  notice: DraftNoticeProps | null
  /** Cancels a pending write and removes the record (Save, Discard changes, Cancel). */
  forget: () => Promise<void>
}

/** HEAD /api/images/{id}: 404 means swept; anything else that is not ok is not a verdict. */
async function defaultImageExists(id: string): Promise<boolean> {
  const res = await fetch(`/api/images/${encodeURIComponent(id)}`, { method: 'HEAD', credentials: 'same-origin' })
  if (res.ok) return true
  if (res.status === 404 || res.status === 410) return false
  throw new Error(`image check: ${res.status}`)
}

/** The draft without the Photos that are gone; `lost` when one was dropped. */
async function withoutSweptPhotos(draft: RecipeDraft, exists: (id: string) => Promise<boolean>): Promise<{ draft: RecipeDraft; lost: boolean }> {
  const ids = [draft.image, ...draft.steps.map((s) => s.image)].filter((id) => id !== '')
  const gone = new Set<string>()
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      try {
        if (!(await exists(id))) gone.add(id)
      } catch {
        // the network is not a verdict: keep it
      }
    }),
  )
  if (gone.size === 0) return { draft, lost: false }
  return {
    draft: { ...draft, image: gone.has(draft.image) ? '' : draft.image, steps: draft.steps.map((s) => (gone.has(s.image) ? { ...s, image: '' } : s)) },
    lost: true,
  }
}

const deviceOf = (): 'phone' | 'computer' =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches ? 'phone' : 'computer'

type Phase = 'waiting' | 'asking' | 'active'

export function useRecipeDraft({ recipeId, ready, draft, dirty, storedUpdatedAt, what, restore, reset, imageExists = defaultImageExists }: UseRecipeDraftOptions): UseRecipeDraft {
  useReportUnsavedChanges(dirty)
  const me = useMe().data
  const userId = me?.id
  const timeZone = me?.householdTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const confirmApi = useConfirm()
  const key = userId === undefined ? null : draftKey(userId, recipeId ?? 'new')
  const isNew = recipeId === undefined

  const storeRef = useRef<Promise<DraftStore> | null>(null)
  const store = () => (storeRef.current ??= openDraftStore())
  const [phase, setPhase] = useState<Phase>('waiting')
  const [notice, setNotice] = useState<DraftNoticeProps | null>(null)
  const writer = useRef<DraftWriter<RecipeDraft> | null>(null)
  // A record of this editor exists (written now, or restored from before): turning clean again removes it.
  const hasRecord = useRef(false)
  const latest = useRef({ what, isNew, restore, reset, imageExists, timeZone })
  latest.current = { what, isNew, restore, reset, imageExists, timeZone }

  const remove = useCallback(async () => {
    if (!key) return
    hasRecord.current = false
    if (writer.current) await writer.current.discard()
    else {
      try {
        await (await store()).remove('recipe', key)
      } catch {
        // a failing store never throws into the editor
      }
    }
  }, [key])

  // Read once, when the baseline is known.
  const read = useRef(false)
  useEffect(() => {
    if (!ready || !key || read.current) return
    read.current = true
    let live = true
    void (async () => {
      let record: DraftRecord<RecipeDraft> | null = null
      let s: DraftStore | null = null
      try {
        s = await store()
        record = await s.get<RecipeDraft>('recipe', key)
      } catch {
        record = null
      }
      if (!live) return
      const decision: DraftDecision = decideDraft({ draft: record, currentUpdatedAt: storedUpdatedAt, now: Date.now() })
      const copy = (kind: DraftDecision, photoLost: boolean) =>
        draftNotice(kind, { noun: 'Recipe', device: deviceOf(), timeZone: latest.current.timeZone, photoLost })
      if (record && (decision.kind === 'restore' || decision.kind === 'offer')) {
        const { draft: kept, lost } = await withoutSweptPhotos(record.draft, latest.current.imageExists)
        if (!live) return
        const words = copy({ kind: 'restore', savedAt: decision.savedAt }, lost)!
        hasRecord.current = true
        latest.current.restore(kept)
        setNotice({
          title: words.title,
          meta: words.meta,
          actions: [
            {
              label: draftActionLabel('discard', 'restore'),
              onClick: () => {
                const { what: w, isNew: n } = latest.current
                void confirmApi.confirm(discardDialog(w, n)).then(async (yes) => {
                  if (!yes) return
                  await remove()
                  latest.current.reset()
                  setNotice(null)
                })
              },
            },
          ],
        })
        setPhase('active')
      } else if (record && decision.kind === 'ask') {
        const { draft: kept, lost } = await withoutSweptPhotos(record.draft, latest.current.imageExists)
        if (!live) return
        const words = copy(decision, lost)!
        hasRecord.current = true
        setNotice({
          title: words.title,
          meta: words.meta,
          actions: [
            {
              label: draftActionLabel('restore', 'ask'),
              onClick: () => {
                latest.current.restore(kept)
                setNotice(null)
                setPhase('active')
              },
            },
            {
              label: draftActionLabel('discard', 'ask'),
              onClick: () => {
                setNotice(null)
                void remove().then(() => setPhase('active'))
              },
            },
          ],
        })
        setPhase('asking')
      } else {
        if (record && decision.kind === 'orphaned' && s) {
          try {
            await s.remove('recipe', key)
          } catch {
            // ignored
          }
        }
        if (live) setPhase('active')
      }
    })()
    return () => {
      live = false
      read.current = false
    }
    // storedUpdatedAt is read once, with the record, when the editor is ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key])

  // The writer: debounced writes and the pagehide flush, once the record was read and no question is open.
  useEffect(() => {
    if (phase !== 'active' || !key) return
    let disposed = false
    let made: DraftWriter<RecipeDraft> | null = null
    void store().then((s) => {
      if (disposed) return
      made = createDraftWriter<RecipeDraft>({ store: s, area: 'recipe', key, baseUpdatedAt: storedUpdatedAt })
      writer.current = made
      const { draft: d, dirty: isDirty } = pending.current
      if (isDirty) {
        made.change(d)
        hasRecord.current = true
      }
    })
    return () => {
      disposed = true
      made?.dispose()
      if (writer.current === made) writer.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, key, storedUpdatedAt])

  const pending = useRef({ draft, dirty })
  pending.current = { draft, dirty }
  useEffect(() => {
    const w = writer.current
    if (phase !== 'active' || !w) return
    if (dirty) {
      w.change(draft)
      hasRecord.current = true
    } else if (hasRecord.current) {
      hasRecord.current = false
      void w.discard()
    }
  }, [draft, dirty, phase])

  const forget = useCallback(async () => {
    setNotice(null)
    await remove()
  }, [remove])

  return { notice, forget }
}
