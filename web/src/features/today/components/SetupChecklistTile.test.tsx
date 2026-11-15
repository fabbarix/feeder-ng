// B9-53 (TB-06; changed on purpose, the whole file): "Set up your Household" is a soft tile with a TileHeader and a "N of 5" count, a progress bar and
// five numbered steps as rows (R-E): done steps show a tick and a one-line summary, the current step is expanded and holds the only controls, later
// steps are muted. Every control is a real button with its own name (P38), none tertiary, none an icon of the old table. After the first plan the tile is
// compact and sits after the hero. The mocks are tb-06-step1..5.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { THREE_DONE, FRESH } from '../../../test/setupFacts'
import { setupChecklist, type SetupFacts } from '../lib/setup'
import { SetupChecklistTile, type SetupTileActions } from './SetupChecklistTile'

const ROWS = [
  { id: 'timeZone' as const, key: 'Time zone', state: 'Europe/Rome', detail: 'From this device · 15:44 now', changeLabel: 'Change time zone' },
  { id: 'currency' as const, key: 'Currency', state: 'Euro (€)', detail: 'From Italy', changeLabel: 'Change currency' },
]

const actions = (): SetupTileActions & Record<string, ReturnType<typeof vi.fn>> => ({
  confirmZone: vi.fn(),
  changeZone: vi.fn(),
  addMember: vi.fn(),
  setUpMealSlots: vi.fn(),
  newRecipe: vi.fn(),
  readRecipe: vi.fn(),
  importRecipes: vi.fn(),
  addRecipe: vi.fn(),
  hide: vi.fn(),
}) as never

function setup(f: SetupFacts = FRESH, over: { isAdmin?: boolean; busy?: boolean } = {}) {
  const a = actions()
  const view = render(<SetupChecklistTile checklist={setupChecklist(f)} zoneRows={ROWS} actions={a} {...over} />)
  const rerender = (next: SetupFacts, o: { isAdmin?: boolean; busy?: boolean } = over) =>
    view.rerender(<SetupChecklistTile checklist={setupChecklist(next)} zoneRows={ROWS} actions={a} {...o} />)
  return { ...view, a, rerender }
}
const tile = () => screen.getByRole('region', { name: 'Set up your Household' })
// the steps are the ol's own li (step 1 holds a ul of detected settings, whose li are not steps)
const step = (n: number) => within(tile()).getByRole('list', { name: 'Setup steps' }).querySelectorAll<HTMLElement>(':scope > li')[n - 1]!
const names = () => within(tile()).queryAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent!.trim())

describe('SetupChecklistTile: the tile', () => {
  it('is a full-width soft section named by its h2, with one TileHeader (neutral badge) and the count "0 of 5"', () => {
    const { container } = setup()
    const t = tile()
    expect(t).toHaveAttribute('data-variant', 'soft')
    expect(t).toHaveAttribute('data-span', 'full')
    const h2 = within(t).getByRole('heading', { level: 2, name: 'Set up your Household' })
    expect(t).toHaveAttribute('aria-labelledby', h2.id)
    expect(container.querySelectorAll('.tile-header')).toHaveLength(1)
    expect(container.querySelector('.tile-header__badge')).toHaveAttribute('data-tone', 'neutral')
    expect(container.querySelector('.tile-header [data-kind="count"]')).toHaveTextContent('0 of 5')
    expect(container.querySelector('.today__tile-title')).toBeNull()
  })

  it('is a welcome, never a failure: no danger or warning tone anywhere', () => {
    const { container } = setup()
    expect(container.querySelector('[data-status="danger"], [data-status="warn"], [data-tone="danger"], [data-tone="warn"]')).toBeNull()
  })

  it('has a progress bar named "Setup" with the done count out of 5 and a fill of that share', () => {
    const { container } = setup(THREE_DONE)
    const bar = within(tile()).getByRole('progressbar', { name: 'Setup' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '5')
    expect(bar).toHaveAttribute('aria-valuenow', '3')
    expect((bar.firstElementChild as HTMLElement).style.inlineSize).toBe('60%')
    expect(container.querySelector('.tile-header [data-kind="count"]')).toHaveTextContent('3 of 5')
  })

  it('renders nothing when the checklist is not visible', () => {
    const { container } = render(<SetupChecklistTile checklist={setupChecklist(null)} zoneRows={ROWS} actions={actions()} />)
    expect(container).toBeEmptyDOMElement()
    const hidden = render(<SetupChecklistTile checklist={setupChecklist({ ...FRESH, setupHidden: true })} zoneRows={ROWS} actions={actions()} />)
    expect(hidden.container).toBeEmptyDOMElement()
  })
})

describe('SetupChecklistTile: the steps are rows with a state, never bullet sentences (R-E)', () => {
  it('is an ol of five li, in order, each with its number or tick mark, label and one line under it', () => {
    setup()
    const list = within(tile()).getByRole('list', { name: 'Setup steps' })
    expect(list.tagName).toBe('OL')
    const items = Array.from(list.querySelectorAll<HTMLElement>(':scope > li')) // its own li: step 1 holds the Detected settings ul
    expect(items).toHaveLength(5)
    const labels = ['Check time zone and currency', 'Add your Members', 'Set up Meal Slots', 'Add Recipes', 'Get your first plan']
    items.forEach((li, i) => {
      expect(li.querySelector('.setup-step__label')).toHaveTextContent(labels[i]!)
      expect(li.querySelector('.setup-step__mark')).toHaveAttribute('aria-hidden', 'true')
    })
    expect(items.map((li) => li.querySelector('.setup-step__mark')!.textContent)).toEqual(['1', '2', '3', '4', '5'])
    expect(items[1]).toHaveTextContent('Everyone who eats from the plan.')
  })

  it('carries each state as data-state, and aria-current="step" on the current step only', () => {
    setup({ ...THREE_DONE, members: 0, memberNames: [] })
    const states = [1, 2, 3, 4, 5].map((n) => step(n).getAttribute('data-state'))
    expect(states).toEqual(['done', 'current', 'done', 'todo', 'todo'])
    expect([1, 2, 3, 4, 5].map((n) => step(n).getAttribute('aria-current'))).toEqual([null, 'step', null, null, null])
  })

  it('a done step shows a tick (an icon, not a "Done" word) and its one-line summary instead of the hint', () => {
    setup(THREE_DONE)
    expect(step(1).querySelector('.setup-step__mark svg')).not.toBeNull()
    expect(step(1)).toHaveTextContent('Europe/Rome · Euro (€)')
    expect(step(1)).not.toHaveTextContent('Slot times and reminders')
    expect(step(2)).toHaveTextContent('3 Members: Anna, Ben, Chiara')
    expect(step(3)).toHaveTextContent('Breakfast, Lunch, Dinner, every day. Everyone attends.')
    expect(step(1)).not.toHaveTextContent(/^Done|Set up\b.*Done/)
  })

  it('only the current step has controls: later steps are muted and have none', () => {
    setup()
    expect(within(step(2)).queryAllByRole('button')).toHaveLength(0)
    expect(within(step(3)).queryAllByRole('button')).toHaveLength(0)
    expect(within(step(4)).queryAllByRole('button')).toHaveLength(0)
    expect(within(step(5)).queryAllByRole('button')).toHaveLength(0)
  })

  it('no step links to a list page: the tile has no link at all', () => {
    for (const f of [FRESH, { ...FRESH, timeZoneConfigured: true }, { ...THREE_DONE, members: 0, memberNames: [] }, THREE_DONE]) {
      const { unmount } = setup(f)
      expect(within(tile()).queryAllByRole('link')).toHaveLength(0)
      unmount()
    }
  })

  it('no control in the tile is tertiary, and every accessible name is unique (P38)', () => {
    for (const f of [FRESH, { ...FRESH, timeZoneConfigured: true }, { ...FRESH, timeZoneConfigured: true, members: 1, memberNames: ['A'] }, THREE_DONE, { ...THREE_DONE, recipes: 1, plannedMeals: 2 }]) {
      const { container, unmount } = setup(f)
      expect(container.querySelectorAll('[data-variant="tertiary"], [data-variant="danger-tertiary"]')).toHaveLength(0)
      const n = names()
      expect(new Set(n).size, n.join(' | ')).toBe(n.length)
      unmount()
    }
  })
})

describe('SetupChecklistTile: step 1, time zone and currency (mock step 1)', () => {
  it('the detected values are a ul named "Detected settings" of two R-E rows: key, state at the end, detail on one line', () => {
    setup()
    const list = within(step(1)).getByRole('list', { name: 'Detected settings' })
    expect(list.tagName).toBe('UL')
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.querySelector('.setup-fact__key')).toHaveTextContent('Time zone')
    expect(rows[0]!.querySelector('.setup-fact__state')).toHaveTextContent('Europe/Rome')
    expect(rows[0]!.querySelector('.setup-fact__detail')).toHaveTextContent('From this device · 15:44 now')
    expect(rows[1]!.querySelector('.setup-fact__key')).toHaveTextContent('Currency')
    expect(rows[1]!.querySelector('.setup-fact__state')).toHaveTextContent('Euro (€)')
    expect(rows[1]!.querySelector('.setup-fact__detail')).toHaveTextContent('From Italy')
  })

  it('has a secondary Change per row, named "Change time zone" and "Change currency", and "Looks right" as the one primary', async () => {
    const { a } = setup()
    const change = within(step(1)).getByRole('button', { name: 'Change time zone' })
    expect(change).toHaveAttribute('data-variant', 'secondary')
    expect(change).toHaveTextContent('Change')
    expect(within(step(1)).getByRole('button', { name: 'Change currency' })).toHaveAttribute('data-variant', 'secondary')
    const looks = within(step(1)).getByRole('button', { name: 'Looks right' })
    expect(looks).toHaveAttribute('data-variant', 'primary')
    expect(within(tile()).getAllByRole('button').filter((b) => b.getAttribute('data-variant') === 'primary')).toEqual([looks])
    await userEvent.click(change)
    expect(a.changeZone).toHaveBeenCalledWith('timeZone')
    await userEvent.click(within(step(1)).getByRole('button', { name: 'Change currency' }))
    expect(a.changeZone).toHaveBeenLastCalledWith('currency')
    await userEvent.click(looks)
    expect(a.confirmZone).toHaveBeenCalledTimes(1)
  })

  it('while the save runs, "Looks right" is disabled and says so (a spinner), once', async () => {
    const { a } = setup(FRESH, { busy: true })
    const looks = within(step(1)).getByRole('button', { name: 'Looks right' })
    expect(looks).toBeDisabled()
    await userEvent.click(looks).catch(() => {})
    expect(a.confirmZone).not.toHaveBeenCalled()
  })
})

describe('SetupChecklistTile: the other steps', () => {
  it('step 2: "Add a Member" is the primary', async () => {
    const { a } = setup({ ...FRESH, timeZoneConfigured: true, timeZone: 'Europe/Rome', currency: 'EUR' })
    const add = within(step(2)).getByRole('button', { name: 'Add a Member' })
    expect(add).toHaveAttribute('data-variant', 'primary')
    expect(names()).toEqual(['Add a Member'])
    await userEvent.click(add)
    expect(a.addMember).toHaveBeenCalledTimes(1)
  })

  it('step 3: "Set up Meal Slots" is the primary', async () => {
    const { a } = setup({ ...FRESH, timeZoneConfigured: true, members: 3, memberNames: ['Anna', 'Ben', 'Chiara'] })
    const b = within(step(3)).getByRole('button', { name: 'Set up Meal Slots' })
    expect(b).toHaveAttribute('data-variant', 'primary')
    await userEvent.click(b)
    expect(a.setUpMealSlots).toHaveBeenCalledTimes(1)
  })

  it('step 4: "1 of 5 Recipes", three outlined row-buttons (New Recipe, Read a recipe, Import Recipes) and the line about the first plan', async () => {
    const { a } = setup({ ...THREE_DONE, recipes: 1 })
    const s4 = step(4)
    expect(s4).toHaveTextContent('1 of 5 Recipes')
    const ways = ['New Recipe', 'Read a recipe', 'Import Recipes'].map((n) => within(s4).getByRole('button', { name: new RegExp(`^${n}`) }))
    for (const w of ways) expect(w).toHaveClass('setup-way')
    expect(within(s4).getAllByRole('button')).toHaveLength(3)
    expect(s4).toHaveTextContent('You can see your first plan now; it repeats until you add more.')
    await userEvent.click(ways[0]!)
    await userEvent.click(ways[1]!)
    await userEvent.click(ways[2]!)
    expect([a.newRecipe, a.readRecipe, a.importRecipes].map((f) => vi.mocked(f).mock.calls.length)).toEqual([1, 1, 1])
  })

  it('step 4 before any Recipe has no "see your first plan" line (there is no plan to see yet)', () => {
    setup({ ...THREE_DONE, recipes: 0 })
    expect(step(4)).toHaveTextContent('0 of 5 Recipes')
    expect(step(4)).not.toHaveTextContent('first plan now')
  })

  it('step 5 never has a button: the plan is made by the planner', () => {
    setup({ ...THREE_DONE, recipes: 5 })
    expect(within(step(5)).queryAllByRole('button')).toHaveLength(0)
    expect(step(5)).toHaveTextContent('The planner fills the week from your Recipes.')
  })

  it('there is no Hide in the full checklist (it is offered once the first plan exists)', () => {
    setup({ ...THREE_DONE, recipes: 1 })
    expect(screen.queryByRole('button', { name: 'Hide for now' })).toBeNull()
  })
})

describe('SetupChecklistTile: a plain User (R13)', () => {
  it('sees "Ask an Admin to do this." on each open step 1 to 3 and no button on them', () => {
    setup(FRESH, { isAdmin: false })
    expect(screen.getAllByText('Ask an Admin to do this.')).toHaveLength(3)
    for (const n of [1, 2, 3]) expect(within(step(n)).queryAllByRole('button')).toHaveLength(0)
    expect(within(step(1)).queryByRole('button', { name: 'Looks right' })).toBeNull()
  })

  it('still gets the Recipes controls: the current step is the first open one they can act on', () => {
    setup(FRESH, { isAdmin: false })
    expect(step(4)).toHaveAttribute('aria-current', 'step')
    expect(step(1)).not.toHaveAttribute('aria-current')
    expect(within(step(4)).getAllByRole('button')).toHaveLength(3)
  })

  it('an Admin never sees the sentence', () => {
    setup(FRESH)
    expect(screen.queryByText('Ask an Admin to do this.')).toBeNull()
  })

  it('shows the detected rows without Change buttons', () => {
    setup(FRESH, { isAdmin: false })
    expect(within(step(1)).getByRole('list', { name: 'Detected settings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change time zone' })).toBeNull()
  })
})

describe('SetupChecklistTile: compact, after the first plan (mock step 5)', () => {
  const compactFacts = { ...THREE_DONE, recipes: 1, plannedMeals: 6 }

  it('is the same soft tile, not full width, "4 of 5", no list of steps, the bar at 80%', () => {
    const { container } = setup(compactFacts)
    const t = tile()
    expect(t).toHaveClass('setup-tile--compact')
    expect(t).not.toHaveAttribute('data-span', 'full')
    expect(container.querySelector('.tile-header [data-kind="count"]')).toHaveTextContent('4 of 5')
    expect(within(t).queryByRole('list', { name: 'Setup steps' })).toBeNull()
    expect(within(t).getByRole('progressbar', { name: 'Setup' })).toHaveAttribute('aria-valuenow', '4')
    expect((within(t).getByRole('progressbar', { name: 'Setup' }).firstElementChild as HTMLElement).style.inlineSize).toBe('80%')
  })

  it('says how many Recipes more, in one sentence', () => {
    setup(compactFacts)
    expect(tile()).toHaveTextContent('Add 4 more Recipes and the planner has more to choose from. 1 of 5 so far.')
  })

  it('says "1 more Recipe" in the singular at four', () => {
    setup({ ...compactFacts, recipes: 4 })
    expect(tile()).toHaveTextContent('Add 1 more Recipe and the planner has more to choose from. 4 of 5 so far.')
  })

  it('has two secondary buttons, "Add a Recipe" and "Hide for now", and Hide for now carries no icon', async () => {
    const { a } = setup(compactFacts)
    const add = within(tile()).getByRole('button', { name: 'Add a Recipe' })
    const hide = within(tile()).getByRole('button', { name: 'Hide for now' })
    expect(add).toHaveAttribute('data-variant', 'secondary')
    expect(hide).toHaveAttribute('data-variant', 'secondary')
    expect(hide.querySelector('svg')).toBeNull()
    expect(names()).toEqual(['Add a Recipe', 'Hide for now'])
    await userEvent.click(add)
    await userEvent.click(hide)
    expect(a.addRecipe).toHaveBeenCalledTimes(1)
    expect(a.hide).toHaveBeenCalledTimes(1)
  })

  it('a plain User keeps "Add a Recipe" and has no Hide (it is an Admin setting)', () => {
    setup(compactFacts, { isAdmin: false })
    expect(within(tile()).getByRole('button', { name: 'Add a Recipe' })).toBeInTheDocument()
    expect(within(tile()).queryByRole('button', { name: 'Hide for now' })).toBeNull()
  })
})

describe('SetupChecklistTile: focus and announcements (A11Y)', () => {
  it('when a step completes after its button was pressed, focus moves to the next step\'s primary and a polite status says "Step 1 of 5 done."', async () => {
    const { rerender } = setup()
    await userEvent.click(within(step(1)).getByRole('button', { name: 'Looks right' }))
    rerender({ ...FRESH, timeZoneConfigured: true, timeZone: 'Europe/Rome', currency: 'EUR' })
    const next = within(step(2)).getByRole('button', { name: 'Add a Member' })
    expect(next).toHaveFocus()
    const live = within(tile()).getByRole('status')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveTextContent('Step 1 of 5 done.')
  })

  it('the announcement names the step that completed: Members is "Step 2 of 5 done."', async () => {
    const f1 = { ...FRESH, timeZoneConfigured: true }
    const { rerender } = setup(f1)
    await userEvent.click(within(step(2)).getByRole('button', { name: 'Add a Member' }))
    rerender({ ...f1, members: 3, memberNames: ['Anna', 'Ben', 'Chiara'] })
    expect(within(step(3)).getByRole('button', { name: 'Set up Meal Slots' })).toHaveFocus()
    expect(within(tile()).getByRole('status')).toHaveTextContent('Step 2 of 5 done.')
  })

  it('a step that completes elsewhere (nobody pressed here) neither steals focus nor announces', () => {
    const { rerender } = setup()
    rerender({ ...FRESH, timeZoneConfigured: true })
    expect(document.body).toHaveFocus()
    expect(within(tile()).getByRole('status')).toBeEmptyDOMElement()
  })
})
