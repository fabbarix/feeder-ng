// B9-51 (PC-14, A2): the Cooking times tile of Planning rules. Reads who is signed in (only an Admin saves) and the Household
// settings; keeps the draft (each time on or Off, and its last time so Off then On brings it back); checks it, saves it with the
// whole settings and says so. Main-session ruling: Planning rules may read GET /api/me and GET /api/household/settings.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState, type RefObject } from 'react'
import { useMe } from '../../../app/useMe'
import { ApiError, http } from '../../../lib/http'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { useToast } from '../../../ui/Toast'
import { planApi } from '../api'
import { cookingTimesBody, cookingTimesError, cookingTimesOf, DEFAULT_EARLIEST_START, DEFAULT_LATEST_START, startExample, type CookingTimes } from '../lib/cookingTimes'
import { cookingTimesStrings as s } from '../lib/planningRulesStrings'
import { invalidatePlan } from './planCache'
import { useRecipeChoices } from './useRecipeChoices'

/** The Household settings as GET /api/household/settings sends them; only the two times are read here, the rest is sent back. */
type HouseholdSettings = Record<string, unknown> & { earliestStart?: string | null; latestStart?: string | null }

/** The settings' shared react-query key (features/settings settingsKeys.settings), so Household and this tile see one copy. */
const SETTINGS_KEY = ['household', 'settings'] as const

interface TimeDraft {
  on: boolean
  /** The time shown while on; kept while Off so On brings it back. */
  time: string
}
interface Draft {
  earliest: TimeDraft
  latest: TimeDraft
}

const draftOf = (t: CookingTimes): Draft => ({
  earliest: { on: t.earliestStart !== null, time: t.earliestStart ?? DEFAULT_EARLIEST_START },
  latest: { on: t.latestStart !== null, time: t.latestStart ?? DEFAULT_LATEST_START },
})
const timesOf = (d: Draft): CookingTimes => ({ earliestStart: d.earliest.on ? d.earliest.time : null, latestStart: d.latest.on ? d.latest.time : null })

export type CookingTimesFieldErrors = {
  earliestStart?: string
  latestStart?: string
}

export interface UseCookingTimes {
  state: 'loading' | 'error' | 'ready'
  /** Only an Admin changes Household settings; a plain User reads them. */
  canEdit: boolean
  earliest: TimeDraft
  latest: TimeDraft
  setEarliestOn: (on: boolean) => void
  setLatestOn: (on: boolean) => void
  setEarliestTime: (time: string) => void
  setLatestTime: (time: string) => void
  /** The draft differs from the stored times. */
  dirty: boolean
  saving: boolean
  /** Each field's own error (SAFE-04): the client check after a failed save, or the server's 422 on that field. */
  errors: CookingTimesFieldErrors
  /** A failure that belongs to no field: the tile's FormError. */
  formError: string | null
  formRef: RefObject<HTMLFormElement | null>
  /** The example line, live from the draft; null when no Recipe has a total time. */
  example: string | null
  save: () => Promise<void>
}

export function useCookingTimes(): UseCookingTimes {
  const client = useQueryClient()
  const toast = useToast()
  const me = useMe()
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => http.get<HouseholdSettings>('/api/household/settings') })
  const slots = useQuery({ queryKey: ['meal-slots'], queryFn: planApi.mealSlots })
  const recipes = useRecipeChoices()
  const formRef = useRef<HTMLFormElement>(null)
  const [edited, setEdited] = useState<Draft | null>(null)
  const [showCheck, setShowCheck] = useState(false)
  const [serverErrors, setServerErrors] = useState<CookingTimesFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [focusCount, setFocusCount] = useState(0)

  const stored = settings.data ? cookingTimesOf(settings.data) : null
  const draft = edited ?? draftOf(stored ?? { earliestStart: DEFAULT_EARLIEST_START, latestStart: DEFAULT_LATEST_START })
  const times = timesOf(draft)
  const dirty = stored !== null && (times.earliestStart !== stored.earliestStart || times.latestStart !== stored.latestStart)
  const errors: CookingTimesFieldErrors = { ...serverErrors, ...(showCheck ? cookingTimesError(times) : {}) }
  useFocusFirstInvalid(formRef, errors, focusCount)

  const change = (next: (d: Draft) => Draft) => {
    setEdited(next(draft))
    setServerErrors({})
    setFormError(null)
  }

  const save = useCallback(async () => {
    if (!settings.data || saving) return
    setFormError(null)
    setServerErrors({})
    if (cookingTimesError(times).latestStart) {
      setShowCheck(true)
      setFocusCount((n) => n + 1)
      return
    }
    setSaving(true)
    try {
      const saved = await http.put<HouseholdSettings>('/api/household/settings', cookingTimesBody(settings.data, times))
      client.setQueryData(SETTINGS_KEY, saved && typeof saved === 'object' ? saved : { ...settings.data, ...times })
      setEdited(null)
      setShowCheck(false)
      toast.show({ status: 'success', title: s.saved })
      void client.invalidateQueries({ queryKey: SETTINGS_KEY })
      void invalidatePlan(client)
    } catch (e) {
      const field = e instanceof ApiError ? e.details.field : undefined
      if (field === 'latestStart') setServerErrors({ latestStart: s.latestNotLater })
      else if (field === 'earliestStart') setServerErrors({ earliestStart: s.earliestInvalid })
      else setFormError(s.saveFailed)
      if (field === 'latestStart' || field === 'earliestStart') setFocusCount((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }, [client, saving, settings.data, times, toast])

  return {
    state: settings.isError && !settings.data ? 'error' : settings.data ? 'ready' : 'loading',
    canEdit: Boolean(me.data?.isAdmin),
    earliest: draft.earliest,
    latest: draft.latest,
    setEarliestOn: (on) => change((d) => ({ ...d, earliest: { ...d.earliest, on } })),
    setLatestOn: (on) => change((d) => ({ ...d, latest: { ...d.latest, on } })),
    setEarliestTime: (time) => change((d) => ({ ...d, earliest: { ...d.earliest, time } })),
    setLatestTime: (time) => change((d) => ({ ...d, latest: { ...d.latest, time } })),
    dirty,
    saving,
    errors,
    formError,
    formRef,
    example: startExample(recipes.recipes, slots.data ?? [], times),
    save,
  }
}
