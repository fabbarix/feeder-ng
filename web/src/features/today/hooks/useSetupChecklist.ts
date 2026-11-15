import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { detectDevice, zoneChoice, zoneRows, type ZoneRow } from '../lib/currencyGuess'
import { setupChecklist, type SetupChecklist } from '../lib/setup'
import { useSetupActions, type QuickStartSlot, type SetupMemberInput } from '../setupActions'
import { useSetupFacts } from '../setupSeam'
import { todayStrings as s } from '../strings'

/** What a sheet over Today is open: the Member sheet, the Meal Slot quick start, or a picker of step 1. */
export type SetupSheet = 'member' | 'mealSlots' | 'timeZone' | 'currency'

/** The tile's buttons (SetupChecklistTile). */
export interface SetupTileActions {
  confirmZone: () => Promise<void>
  changeZone: (id: 'timeZone' | 'currency') => void
  addMember: () => void
  setUpMealSlots: () => void
  newRecipe: () => void
  readRecipe: () => void
  importRecipes: () => void
  addRecipe: () => void
  hide: () => Promise<void>
}

/** The writes and their state behind the sheets (additive to the pinned API: SetupSheets reads these). */
export interface SetupSheetState {
  /** The time zone and currency step 1 would save now (the Admin's picks, else the detected ones). */
  zoneChoice: { timeZone: string; currency: string }
  memberSaving: boolean
  memberError?: string
  /** Saves a Member; `another` keeps the sheet open (Save and add another) and rejects on a refusal (the sheet keeps what was typed). */
  saveMember: (input: SetupMemberInput, userId: number | null, another: boolean) => Promise<void>
  slotsSaving: boolean
  slotsError?: string
  createMealSlots: (slots: QuickStartSlot[]) => Promise<void>
}

export interface UseSetupChecklist {
  checklist: SetupChecklist
  loading: boolean
  /** Step 1's detected (or picked) facts as rows. */
  zoneRows: ZoneRow[]
  /** "Looks right" is saving. */
  busy: boolean
  sheet: SetupSheet | null
  closeSheet: () => void
  /** A value picked in a step 1 picker: it replaces the detected one until saved. */
  pickZone: (id: 'timeZone' | 'currency', value: string) => void
  /** The quick start's "Set up by hand": the Meal Slots page with the Add editor on every weekday. */
  setUpByHand: () => void
  /** "Set up · step 2 of 5 · 1 Member so far". */
  memberCaption: string
  actions: SetupTileActions
  sheets: SetupSheetState
}

const MEAL_SLOTS_BY_HAND = '/settings/meal-slots?add=1&weekdays=1,2,3,4,5,6,7'
const UI_LOCALE = 'en'

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : s.setupSaveFailed
}

/**
 * The first-run checklist from the Household's facts (TB-06), and what its buttons do: Looks right saves the detected time zone and
 * currency; Members and Meal Slots open sheets over Today (`sheet`); the Recipe ways open the Recipe flows; Hide for now hides it. The
 * writes are setupActions'; nothing here leaves Today except the Recipe flows and "Set up by hand".
 */
export function useSetupChecklist(): UseSetupChecklist {
  const { facts, loading } = useSetupFacts()
  const navigate = useNavigate()
  const writes = useSetupActions()
  const checklist = useMemo(() => setupChecklist(facts), [facts])
  const [device] = useState(detectDevice)
  // The clock in the detail is read when the tile mounts; a minute stale is fine for "15:44 now".
  const [now] = useState(() => new Date())
  const [chosen, setChosen] = useState<{ timeZone?: string; currency?: string }>({})
  const [sheet, setSheet] = useState<SetupSheet | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [memberSaving, setMemberSaving] = useState(false)
  const [memberError, setMemberError] = useState<string>()
  const [slotsSaving, setSlotsSaving] = useState(false)
  const [slotsError, setSlotsError] = useState<string>()

  const rows = useMemo(() => zoneRows({ locale: device.locale, timeZone: device.timeZone, now, uiLocale: UI_LOCALE, chosen }), [device, now, chosen])
  const choice = zoneChoice({ locale: device.locale, timeZone: device.timeZone, chosen })

  const closeSheet = useCallback(() => {
    setSheet(null)
    setMemberError(undefined)
    setSlotsError(undefined)
  }, [])

  const confirmZone = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await writes.confirmDeviceSettings(choice)
      setChosen({})
    } catch {
      // setupActions has said so (a warning toast); the step stays current.
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const saveMember = async (input: SetupMemberInput, userId: number | null, another: boolean) => {
    setMemberSaving(true)
    try {
      await writes.addMember(input, userId)
      setMemberError(undefined)
      if (!another) setSheet(null)
    } catch (err) {
      setMemberError(message(err))
      // Save and add another keeps what was typed (the sheet waits for this rejection); Save just stays open with the error.
      if (another) throw err
    } finally {
      setMemberSaving(false)
    }
  }

  const createMealSlots = async (slots: QuickStartSlot[]) => {
    setSlotsSaving(true)
    try {
      await writes.createMealSlots(slots)
      setSlotsError(undefined)
      setSheet(null)
    } catch (err) {
      setSlotsError(message(err))
    } finally {
      setSlotsSaving(false)
    }
  }

  return {
    checklist,
    loading,
    zoneRows: rows,
    busy,
    sheet,
    closeSheet,
    pickZone: (id, value) => setChosen((c) => ({ ...c, [id]: value })),
    setUpByHand: () => {
      setSheet(null)
      navigate(MEAL_SLOTS_BY_HAND)
    },
    memberCaption: s.setupMemberCaption(facts?.members ?? 0),
    actions: {
      confirmZone,
      changeZone: (id) => setSheet(id),
      addMember: () => setSheet('member'),
      setUpMealSlots: () => setSheet('mealSlots'),
      newRecipe: () => navigate('/recipes/new'),
      readRecipe: () => navigate('/recipes/import?from=photo'),
      importRecipes: () => navigate('/recipes/import?from=file'),
      addRecipe: () => navigate('/recipes/new'),
      hide: () => writes.hide(),
    },
    sheets: { zoneChoice: choice, memberSaving, memberError, saveMember, slotsSaving, slotsError, createMealSlots },
  }
}
