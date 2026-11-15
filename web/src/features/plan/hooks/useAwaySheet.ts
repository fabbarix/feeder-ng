// B9-46 (PC-08): everything the Away sheet does. The data it reads (Members, Meal Slots, the plan's today and last day), the form
// (draft, field errors), the dry run behind "What changes" (debounced 300 ms) and the writes with their toasts (Review, Undo).
// Orchestration only: the rules and the words are in lib/away.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useToast, useUndoToast, type ToastAction } from '../../../ui'
import { planApi, type AwayMember } from '../api'
import {
  addDays,
  awayBody,
  awayButtonNames,
  awayDraft,
  awayErrorField,
  awayFooter,
  awayPreviewModel,
  awaySheetContext,
  awaySheetTitle,
  awaySlotOptions,
  awayToast,
  slotOnDay,
  withFirstDay,
  withLastDay,
  type AwayField,
  type AwayOption,
  type AwayPreviewModel,
  type AwayToastWords,
} from '../lib/away'
import type { PlanChange } from '../lib/replan'
import { awayStrings } from '../strings/away'
import { undoStrings as u } from '../strings/undo'
import type { Away, AwayDraft, AwayPreview, AwaySlotRef, PlanView } from '../types'
import { replanStateOf, restorePlan, updateReplan, writeReplan } from './replanState'
import { useAway } from './useAway'
import { openReplanReview } from './useReplanReview'

const s = awayStrings.away

export interface AwaySheetTarget {
  /** The Member the sheet is for (from the Member sheet): no Who pills. */
  memberId?: number
  /** Opened from a Meal Slot: the first Meal Slot missed. */
  from?: { date: string; mealSlotId: number }
  /** Editing this Away. */
  away?: Away
}

export interface AwaySheetData {
  ready: boolean
  members: AwayMember[]
  slots: AwaySlotRef[]
  today: string
  /** The plan's last date. */
  planEnd: string
}

const deviceToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const NO_MEMBERS: AwayMember[] = []
const NO_SLOTS: AwaySlotRef[] = []

/** The reads of the sheet; they share their keys with the Plan and Settings, so an open Plan reads nothing again. */
export function useAwaySheetData(open: boolean): AwaySheetData {
  const members = useQuery({ queryKey: ['household', 'members'], queryFn: planApi.members, enabled: open })
  const slots = useQuery({ queryKey: ['household', 'meal-slots'], queryFn: planApi.mealSlots, enabled: open })
  const plan = useQuery({ queryKey: ['plan', 'view'], queryFn: () => planApi.view(), enabled: open })
  const view: PlanView | undefined = plan.data
  const today = view?.today || deviceToday()
  const lastSlot = view?.slots.reduce((m, x) => (x.date > m ? x.date : m), '') ?? ''
  const planEnd = lastSlot || addDays(today, Math.max(0, (view?.horizonDays ?? 7) - 1))
  const planSettled = plan.data !== undefined || plan.isError
  return {
    ready: open && members.data !== undefined && slots.data !== undefined && planSettled,
    members: members.data ?? NO_MEMBERS,
    slots: slots.data ?? NO_SLOTS,
    today,
    planEnd,
  }
}

export type AwayPreviewState = { status: 'none' } | { status: 'loading' } | { status: 'ready'; data: AwayPreview; model: AwayPreviewModel } | { status: 'failed' }

export interface AwaySheetController {
  title: string
  context: string | null
  /** The Who pills show (no Member was given and no Away is edited). */
  chooseWho: boolean
  members: AwayMember[]
  draft: AwayDraft
  today: string
  /** An Away that has started: its first day and From cannot change. */
  started: boolean
  fromOptions: AwayOption[]
  throughOptions: AwayOption[]
  /** The selects' values: '' is the whole day. */
  fromValue: string
  throughValue: string
  staysAway: string
  errors: Partial<Record<AwayField, string>>
  /** Grows with every save the server refused at a field (the sheet then focuses the first invalid field). */
  refusals: number
  preview: AwayPreviewState
  footer: { save: string; extra: null | 'end' | 'remove' }
  /** The extra button's accessible name, "Remove Away 12–19 Nov for Ben" / "End today: Away 12–19 Nov for Ben". */
  extraName: string | null
  canSave: boolean
  busy: boolean
  setMember: (id: number) => void
  setFirstDay: (date: string) => void
  setFromSlot: (value: string) => void
  setLastDay: (date: string) => void
  setThroughSlot: (value: string) => void
  setNoLastDay: (on: boolean) => void
  save: () => Promise<void>
  extra: () => Promise<void>
}

const slotValue = (id: number | null) => (id === null ? '' : String(id))
const slotId = (value: string) => (value === '' ? null : Number(value))

/** The form of the sheet; mounted once its data is ready, so the draft starts from it. */
export function useAwaySheet(target: AwaySheetTarget, data: AwaySheetData, onClose: () => void): AwaySheetController {
  const client = useQueryClient()
  const toast = useToast()
  const undoToast = useUndoToast()
  const navigate = useNavigate()
  const location = useLocation()
  const api = useAway()
  const { members, slots, today, planEnd } = data
  const editing = target.away ?? null
  const [draft, setDraft] = useState<AwayDraft>(() => awayDraft({ today, slots, memberId: target.memberId, from: target.from, away: editing ?? undefined }))
  const [errors, setErrors] = useState<Partial<Record<AwayField, string>>>({})
  const [refusals, setRefusals] = useState(0)
  const [preview, setPreview] = useState<AwayPreviewState>({ status: 'none' })
  const [busy, setBusy] = useState(false)

  const member = members.find((m) => m.id === draft.memberId)
  const name = editing?.memberName ?? member?.name
  const fixedName = editing?.memberName ?? (target.memberId !== undefined ? member?.name : undefined)
  const started = editing?.started ?? false
  const mode = editing ? 'patch' : 'create'
  const body = useMemo(() => awayBody(draft, mode, { started }), [draft, mode, started])
  const bodyKey = JSON.stringify(body)

  const edit = (next: (d: AwayDraft) => AwayDraft) => {
    setDraft(next)
    setErrors({})
  }

  // The dry run, 300 ms after the last change: "Checking the plan…" meanwhile; a refusal shows at its field at once.
  const runId = useRef(0)
  useEffect(() => {
    const memberId = draft.memberId
    if (memberId === null || !name) {
      setPreview({ status: 'none' })
      return
    }
    const id = ++runId.current
    setPreview({ status: 'loading' })
    const timer = setTimeout(() => {
      api.preview(memberId, JSON.parse(bodyKey) as Record<string, unknown>, editing?.id).then(
        (p) => {
          if (id === runId.current) setPreview({ status: 'ready', data: p, model: awayPreviewModel(p, { name, planEnd }) })
        },
        (err: unknown) => {
          if (id !== runId.current) return
          const field = awayErrorField(err, draft.noLastDay)
          if (field && err instanceof Error) setErrors({ [field]: err.message })
          setPreview({ status: 'failed' })
        },
      )
    }, 300)
    return () => clearTimeout(timer)
    // The body key stands for the draft; api.preview is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyKey, draft.memberId, name, editing?.id, planEnd])

  /** A refusal: at its field (focus moves there), or a toast. */
  const refuse = (err: unknown) => {
    const field = awayErrorField(err, draft.noLastDay)
    const message = err instanceof Error ? err.message : String(err)
    if (field) {
      setErrors({ [field]: message })
      setRefusals((n) => n + 1)
    } else {
      toast.show({ status: 'error', title: message })
    }
  }

  /** Review opens What changed on the Plan (the screen that holds it); from elsewhere it goes to the Plan first. */
  const reviewAction = useCallback(
    (changes: PlanChange[], undoToken: string | undefined): ToastAction[] => {
      if (changes.length === 0) return []
      writeReplan(client, replanStateOf({ kind: 'away', changes, undoToken }))
      return [
        {
          label: u.review,
          ariaLabel: u.reviewAria(changes.length),
          onClick: () => {
            updateReplan(client, openReplanReview)
            if (!location.pathname.startsWith('/plan')) navigate('/plan')
          },
        },
      ]
    },
    [client, location.pathname, navigate],
  )

  /** The toast of a write: Review when other meals moved, Undo with the server's token (POST /api/plan/restore). */
  const announce = (words: AwayToastWords, changes: PlanChange[], undoToken: string | undefined) => {
    const actions = reviewAction(changes, undoToken)
    if (!undoToken) {
      toast.show({ title: words.headline, subline: words.subline, body: words.body, actions })
      return
    }
    undoToast.show({
      headline: words.headline,
      subline: words.subline,
      body: words.body,
      actions,
      restored: words.restored,
      durationMs: actions.length > 0 ? 10_000 : undefined,
      undo: async () => {
        try {
          await restorePlan(client, undoToken)
        } finally {
          await client.invalidateQueries({ queryKey: ['household', 'away'] })
        }
      },
    })
  }

  const run = async (call: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await call()
    } catch (err) {
      refuse(err)
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      if (editing) {
        const out = await api.update(editing.id, body)
        onClose()
        announce(awayToast('changed', { away: out.away, slots, today }), out.changes, out.undoToken)
        return
      }
      if (draft.memberId === null) return
      const shown = preview.status === 'ready' ? preview.data : null
      const out = await api.create(draft.memberId, body)
      onClose()
      announce(awayToast('created', { away: out.away, slots, today, preview: shown }), out.changes, out.undoToken)
    })

  const extra = () =>
    run(async () => {
      if (!editing) return
      if (editing.started) {
        const out = await api.end(editing.id)
        onClose()
        announce(awayToast('ended', { away: out.away, slots, today }), out.changes, out.undoToken)
        return
      }
      const out = await api.remove(editing.id)
      onClose()
      announce(awayToast('removed', { away: editing, slots, today }), out.changes, out.undoToken)
    })

  const fromLabel = target.from ? slotOnDay(target.from.date, target.from.mealSlotId, slots) : undefined
  const names = editing ? awayButtonNames(editing) : null
  const footer = awayFooter(editing)

  return {
    title: awaySheetTitle(fixedName),
    context: awaySheetContext({ memberName: name, away: editing ?? undefined, from: fromLabel }),
    chooseWho: !editing && target.memberId === undefined,
    members,
    draft,
    today,
    started,
    fromOptions: awaySlotOptions(draft.from, slots, 'first'),
    throughOptions: awaySlotOptions(draft.through, slots, 'last'),
    fromValue: slotValue(draft.fromMealSlotId),
    throughValue: slotValue(draft.throughMealSlotId),
    staysAway: name ? s.staysAway(name) : s.staysAwayAnyone,
    errors,
    refusals,
    preview,
    footer,
    extraName: names ? (footer.extra === 'end' ? names.end : names.remove) : null,
    canSave: draft.memberId !== null && !busy,
    busy,
    setMember: (id) => edit((d) => ({ ...d, memberId: id })),
    setFirstDay: (date) => edit((d) => withFirstDay(d, date, slots)),
    setFromSlot: (value) => edit((d) => ({ ...d, fromMealSlotId: slotId(value) })),
    setLastDay: (date) => edit((d) => withLastDay(d, date, slots)),
    setThroughSlot: (value) => edit((d) => ({ ...d, throughMealSlotId: slotId(value) })),
    setNoLastDay: (on) => edit((d) => ({ ...d, noLastDay: on })),
    save,
    extra,
  }
}
