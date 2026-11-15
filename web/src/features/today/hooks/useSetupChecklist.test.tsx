// B9-53 (TB-06; changed on purpose): the hook turns the facts into the checklist and the tile's actions. Navigation goes to the Recipe flows only (no list
// page); Members, Meal Slots and the two pickers are sheets over Today (`sheet`), closed with `closeSheet`. The writes are setupActions'.
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FRESH, THREE_DONE } from '../../../test/setupFacts'
import * as actionsModule from '../setupActions'
import * as seam from '../setupSeam'
import { useSetupChecklist } from './useSetupChecklist'

vi.mock('../setupSeam', () => ({ useSetupFacts: vi.fn() }))
vi.mock('../setupActions', () => ({ useSetupActions: vi.fn() }))
vi.mock('../lib/currencyGuess', async (orig) => ({
  ...(await orig<typeof import('../lib/currencyGuess')>()),
  detectDevice: () => ({ timeZone: 'Europe/Rome', locale: 'it-IT' }),
}))

const confirm = vi.fn(async () => {})
const hide = vi.fn(async () => {})
let path = ''
function Probe() {
  const l = useLocation()
  path = l.pathname + l.search
  return null
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <Probe />
    {children}
  </MemoryRouter>
)

beforeEach(() => {
  vi.mocked(seam.useSetupFacts).mockReset()
  confirm.mockClear()
  hide.mockClear()
  vi.mocked(actionsModule.useSetupActions).mockReturnValue({ confirmDeviceSettings: confirm, hide } as never)
})

describe('useSetupChecklist', () => {
  it('turns the facts into the checklist and passes loading through', () => {
    vi.mocked(seam.useSetupFacts).mockReturnValue({ facts: { ...FRESH, timeZoneConfigured: true, members: 1, memberNames: ['Anna'] }, loading: false })
    const { result } = renderHook(() => useSetupChecklist(), { wrapper })
    expect(result.current.loading).toBe(false)
    expect(result.current.checklist.visible).toBe(true)
    expect(result.current.checklist.steps.find((s) => s.current)!.id).toBe('attendance')
  })

  it('while loading there is nothing to show', () => {
    vi.mocked(seam.useSetupFacts).mockReturnValue({ facts: null, loading: true })
    const { result } = renderHook(() => useSetupChecklist(), { wrapper })
    expect(result.current.loading).toBe(true)
    expect(result.current.checklist.visible).toBe(false)
  })

  it('the zone rows are the detected ones: Europe/Rome and Euro (€) from an it-IT browser', () => {
    vi.mocked(seam.useSetupFacts).mockReturnValue({ facts: FRESH, loading: false })
    const { result } = renderHook(() => useSetupChecklist(), { wrapper })
    expect(result.current.zoneRows.map((r) => [r.key, r.state])).toEqual([['Time zone', 'Europe/Rome'], ['Currency', 'Euro (€)']])
  })
})

describe('useSetupChecklist: actions', () => {
  const hook = (f = FRESH) => {
    vi.mocked(seam.useSetupFacts).mockReturnValue({ facts: f, loading: false })
    return renderHook(() => useSetupChecklist(), { wrapper })
  }

  it('Looks right saves the detected zone and currency, once', async () => {
    const { result } = hook()
    await act(() => result.current.actions.confirmZone())
    expect(confirm).toHaveBeenCalledWith({ timeZone: 'Europe/Rome', currency: 'EUR' })
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('busy is true while the save runs, and a second press during it saves nothing more', async () => {
    let release!: () => void
    confirm.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
    const { result } = hook()
    let first!: Promise<void>
    act(() => {
      first = result.current.actions.confirmZone()
    })
    expect(result.current.busy).toBe(true)
    await act(() => result.current.actions.confirmZone())
    expect(confirm).toHaveBeenCalledTimes(1)
    await act(async () => {
      release()
      await first
    })
    expect(result.current.busy).toBe(false)
  })

  it('Change opens the picker for that fact; picking replaces the row ("Changed by you") and Looks right saves the pick', async () => {
    const { result } = hook()
    act(() => result.current.actions.changeZone('timeZone'))
    expect(result.current.sheet).toBe('timeZone')
    act(() => result.current.pickZone('timeZone', 'Europe/London'))
    act(() => result.current.closeSheet())
    expect(result.current.sheet).toBeNull()
    expect(result.current.zoneRows[0]).toMatchObject({ state: 'Europe/London', detail: 'Changed by you' })
    await act(() => result.current.actions.confirmZone())
    expect(confirm).toHaveBeenCalledWith({ timeZone: 'Europe/London', currency: 'EUR' })
  })

  it('Add a Member opens the Member sheet and Set up Meal Slots the quick start, both over Today (the path does not change)', () => {
    const { result } = hook({ ...FRESH, timeZoneConfigured: true })
    act(() => result.current.actions.addMember())
    expect(result.current.sheet).toBe('member')
    act(() => result.current.closeSheet())
    act(() => result.current.actions.setUpMealSlots())
    expect(result.current.sheet).toBe('mealSlots')
    act(() => result.current.closeSheet())
    expect(result.current.sheet).toBeNull()
    expect(path).toBe('/')
  })

  it('the Recipe ways open the Recipe flows, with the import sources the chapter names', () => {
    const { result } = hook(THREE_DONE)
    act(() => result.current.actions.newRecipe())
    expect(path).toBe('/recipes/new')
    act(() => result.current.actions.readRecipe())
    expect(path).toBe('/recipes/import?from=photo')
    act(() => result.current.actions.importRecipes())
    expect(path).toBe('/recipes/import?from=file')
    act(() => result.current.actions.addRecipe())
    expect(path).toBe('/recipes/new')
  })

  it('Set up by hand opens the Meal Slots page with the Add editor and every weekday chosen', () => {
    const { result } = hook({ ...FRESH, timeZoneConfigured: true, members: 1, memberNames: ['Anna'] })
    act(() => result.current.actions.setUpMealSlots())
    act(() => result.current.setUpByHand())
    expect(result.current.sheet).toBeNull()
    expect(path).toBe('/settings/meal-slots?add=1&weekdays=1,2,3,4,5,6,7')
  })

  it('Hide for now hides the checklist through setupActions', async () => {
    const { result } = hook({ ...THREE_DONE, recipes: 1, plannedMeals: 2 })
    await act(() => result.current.actions.hide())
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('a refused save leaves the step as it was and the sheet state untouched', async () => {
    confirm.mockRejectedValueOnce(new Error('nope'))
    const { result } = hook()
    await act(() => result.current.actions.confirmZone())
    expect(result.current.busy).toBe(false)
    expect(result.current.checklist.steps[0]!.current).toBe(true)
  })

  it('the Member count of the sheet caption comes from the facts: "Set up · step 2 of 5 · 1 Member so far"', () => {
    const { result } = hook({ ...FRESH, timeZoneConfigured: true, members: 1, memberNames: ['Anna'] })
    expect(result.current.memberCaption).toBe('Set up · step 2 of 5 · 1 Member so far')
    const none = hook({ ...FRESH, timeZoneConfigured: true })
    expect(none.result.current.memberCaption).toBe('Set up · step 2 of 5 · no Members yet')
    const many = hook({ ...FRESH, timeZoneConfigured: true, members: 3, memberNames: ['A', 'B', 'C'] })
    expect(many.result.current.memberCaption).toBe('Set up · step 2 of 5 · 3 Members so far')
  })
})
