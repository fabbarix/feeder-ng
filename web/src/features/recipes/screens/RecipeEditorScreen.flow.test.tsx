// B9-37 (RX-02, RX-08, RX-09, RX-10, SHORT-08; decisions RX 4, RX 5, RX 6): the Recipe editor as a faster flow, through the whole screen (the real
// useRecipeEditor and useRecipeDraft on the B9-31 harness: a data router, a routed fetch stub, an in-memory draft store).
//   sections       Recipe (Name, the Photo button, Kind) · Ingredients (with the Yield) · Steps · "Description and source" and "Planning" as
//                  closed Disclosures with a one-line summary; they open by themselves on an error, by the hash, by the section index, or when
//                  left open before on this device (localStorage "feeder.recipeEditor.open": only which sections are open).
//   new Recipe     the Name has the cursor; one empty line and one empty Step; an untouched row is dropped on Save; a fresh editor is clean.
//   fast entry     a pick moves the cursor to Quantity (selected); Enter in the Note of the last line adds a line; Optional is a checkbox.
//   Steps          Lead time and Duration in min, h or d; a Step's ⋮ holds Remove on a phone.
//   Tags           removable chips and "Add Tag" (the chooser itself is tested in components/TagChooser.test.tsx).
// Layout (heights, the single-row line from 42 rem, the ring of a nested control, the Save bar on its column) is in the page-layout scenarios
// recipe-editor-flow, recipe-new-flow and recipe-editor-tag-chooser and in recipe-editor.flow.css.test.ts: jsdom does not lay out.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PICKED_ID } from '../../../ui/ImagePicker/fake.test-helper'
import { recipe } from '../fixtures.test-helper'
import { api, mount, nameField, ready, resetDraftStore } from './RecipeEditorScreen.safe.harness.test-helper'

vi.mock('../hooks/useIngredientRefs', async () => {
  const { garlic, flour } = await import('../fixtures.test-helper')
  return { useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour]]), isLoading: false }) }
})
vi.mock('../hooks/useRecipeTags', () => ({
  useRecipeTags: () => ({
    known: [{ name: 'roast', recipes: 3 }, { name: 'quick', recipes: 2 }, { name: 'family', recipes: 5 }],
    colourOf: (n: string) => ({ roast: 'tomato', quick: 'sky', family: 'apricot' })[n.toLowerCase()],
    isLoading: false,
  }),
}))
vi.mock('../../../lib/courses/useCourses', async () => {
  const { courseChoices } = await import('../fixtures.test-helper')
  return { useCourses: () => ({ choices: courseChoices, isPending: false, isError: false }) }
})
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 7, email: 'a@b.c', displayName: 'Anna', isAdmin: false, householdTimeZone: 'Europe/Rome' } }) }))
vi.mock('../../../lib/drafts/draftStore', async (orig) => {
  const real = await orig<typeof import('../../../lib/drafts/draftStore')>()
  return { ...real, openDraftStore: async () => (await import('./RecipeEditorScreen.safe.harness.test-helper')).drafts.store }
})
vi.mock('../../../ui', async (orig) => ({ ...(await orig<object>()), ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker }))

const OPEN_KEY = 'feeder.recipeEditor.open'
const ABOUT = 'recipe-section-about'
const PLANNING = 'recipe-section-planning'
const aboutButton = () => screen.getByRole('button', { name: /^Description and source/ })
const planningButton = () => screen.getByRole('button', { name: /^Planning/ })
const ingredients = () => screen.getByRole('region', { name: 'Ingredients' })
const steps = () => screen.getByRole('region', { name: 'Steps' })
const stepCards = () => within(steps()).getAllByRole('listitem').filter((li) => li.classList.contains('step-card'))
const save = () => userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
const pick = async (combo: HTMLElement, name: RegExp) => {
  await userEvent.click(combo)
  await userEvent.click(screen.getByRole('option', { name }))
}
// The ToastProvider's always-present live regions are not content.
const toastText = () => document.querySelector('.toast')?.textContent ?? ''

let scratch: ReturnType<typeof api>
beforeEach(() => {
  resetDraftStore()
  window.localStorage.clear()
  window.location.hash = ''
  scratch = api({ 'GET /api/household/settings': { defaultCooldownDays: 7, defaultLeftoverUseByDays: 2, frozenUseByDays: 90 } })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  window.localStorage.clear()
  window.location.hash = ''
})

describe('the sections (RX-02)', () => {
  it('Recipe, Ingredients, Steps, then Description and source and Planning, in that order', async () => {
    mount()
    await ready()
    const order = [
      nameField(),
      screen.getByRole('radiogroup', { name: 'Kind' }),
      screen.getByRole('heading', { name: 'Ingredients' }),
      screen.getByRole('heading', { name: 'Steps' }),
      aboutButton(),
      planningButton(),
    ]
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}`).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Recipe' })).toContainElement(nameField())
  })

  it('has no "Details" tile and no separate Photo tile any more', async () => {
    mount()
    await ready()
    expect(screen.queryByRole('heading', { name: 'Details' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Photo' })).toBeNull()
  })

  it('the section index lists the five sections, in order', async () => {
    mount()
    await ready()
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Recipe', 'Ingredients', 'Steps', 'Description and source', 'Planning'])
  })

  it('choosing a collapsed section in the index opens it', async () => {
    mount()
    await ready()
    expect(planningButton()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { name: 'Planning' }))
    await waitFor(() => expect(planningButton()).toHaveAttribute('aria-expanded', 'true'))
  })

  it('the Save bar is on the form column, with Cancel and Save Recipe on one row (SHORT-08)', async () => {
    mount()
    await ready()
    const bar = screen.getByRole('group', { name: 'Recipe actions' })
    expect(bar).toHaveAttribute('data-column', 'form')
    expect(within(bar).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Save Recipe' })).toBeInTheDocument()
  })
})

describe('the Photo is one 96 px button beside the Name', () => {
  it('"Photo of the Recipe: add" with no photo, "...: change" with one', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    expect(screen.getByRole('button', { name: 'Photo of the Recipe: add' })).toBeInTheDocument()
  })

  it('a stored photo says "change"; no picker is drawn until it is pressed', async () => {
    api({ 'GET /api/recipes/3': recipe({ id: 3, image: 'abc', updatedAt: '2026-11-14T10:00:00Z' }) })
    mount()
    await ready()
    expect(screen.getByRole('button', { name: 'Photo of the Recipe: change' })).toBeInTheDocument()
    expect(screen.queryByTestId('fake-image-picker')).toBeNull()
  })

  it('pressing it opens the shared picker in a dialog named "Photo"; picking sets the Recipe photo (and the button says change)', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await userEvent.click(screen.getByRole('button', { name: 'Photo of the Recipe: add' }))
    const dialog = screen.getByRole('dialog', { name: 'Photo' })
    expect(within(dialog).getByRole('group', { name: 'Photo' })).toHaveAttribute('data-mode', 'upload')
    await userEvent.click(within(dialog).getByRole('button', { name: 'pick Photo' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Photo' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Photo of the Recipe: change' })).toHaveFocus()
    // and it is the one that gets saved
    await userEvent.type(nameField(), 'Aioli')
    await pick(screen.getByRole('combobox', { name: 'Ingredient' }), /garlic/)
    await userEvent.type(screen.getByRole('textbox', { name: 'Quantity' }), '2')
    await save()
    await waitFor(() => expect(scratch.callsTo('POST', '/api/recipes')).toHaveLength(1))
    expect(scratch.callsTo('POST', '/api/recipes')[0]!.body).toMatchObject({ image: PICKED_ID })
  })
})

describe('the Kind is one Segmented control (RX-10, decision RX 4)', () => {
  it('Recipe, Ready Meal and Base recipe in a radiogroup "Kind"; a stored Recipe has Recipe on', async () => {
    mount()
    await ready()
    const group = screen.getByRole('radiogroup', { name: 'Kind' })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Recipe', 'Ready Meal', 'Base recipe'])
    expect(within(group).getByRole('radio', { name: 'Recipe' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('A Ready Meal is one bought pack. A Base recipe is used inside other Recipes and never planned.')).toBeInTheDocument()
  })

  it('the old controls are gone: no "Base recipe" switch, no "Ready Meal" checkbox', async () => {
    mount()
    await ready()
    expect(screen.queryByRole('switch', { name: 'Base recipe' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Ready Meal' })).toBeNull()
  })

  it('Ready Meal makes the one pack line named after the Recipe; Base recipe takes it away, hides the Courses and asks for a Yield unit; Recipe brings the Courses back', async () => {
    mount('/recipes/new')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Lasagne')
    await userEvent.click(screen.getByRole('radio', { name: 'Ready Meal' }))
    expect(screen.getByText('New Ingredient')).toBeInTheDocument()
    expect(within(ingredients()).getByText('One pack is')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Base recipe' }))
    expect(screen.queryByText('New Ingredient')).toBeNull()
    expect(within(ingredients()).getByText('One Batch makes')).toBeInTheDocument()
    expect(within(ingredients()).getByRole('combobox', { name: 'Yield unit' })).toBeInTheDocument()
    await userEvent.click(planningButton())
    expect(screen.queryByRole('group', { name: 'Courses' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Planning/ })).toHaveTextContent('Never planned')
    await userEvent.click(screen.getByRole('radio', { name: 'Recipe' }))
    expect(screen.getByRole('group', { name: 'Courses' })).toBeInTheDocument()
    expect(within(ingredients()).getByText('For one Batch of')).toBeInTheDocument()
  })

  it('a saved Recipe that is turned into a Base recipe asks on Save (the P6 confirm) and saves nothing before the answer', async () => {
    const stub = api({
      'POST /api/recipes/3/to-base?dryRun=1': { plannedMeals: [], slotRules: [], leftovers: 0, preferences: 0 },
    })
    mount()
    await ready()
    await userEvent.click(screen.getByRole('radio', { name: 'Base recipe' }))
    expect(stub.callsTo('PUT', '/api/recipes/3')).toHaveLength(0)
    await save()
    expect(await screen.findByRole('dialog', { name: 'Turn Roast tray into a Base recipe?' })).toBeInTheDocument()
    expect(stub.callsTo('PUT', '/api/recipes/3')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(stub.callsTo('PUT', '/api/recipes/3')).toHaveLength(0)
  })

  it('the Yield sits in the Ingredients head: "For one Batch of [- 4 +] portions"', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    expect(within(ingredients()).getByText('For one Batch of')).toBeInTheDocument()
    expect(within(ingredients()).getByRole('spinbutton', { name: 'Yield' })).toHaveAttribute('aria-valuenow', '4')
    expect(within(ingredients()).getByText('portions')).toBeInTheDocument()
  })
})

describe('"Description and source" and "Planning" are closed Disclosures (RX-02, decision RX 5)', () => {
  it('both are closed on a new Recipe and on a saved one, each with a one-line summary', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    expect(aboutButton()).toHaveAttribute('aria-expanded', 'false')
    expect(planningButton()).toHaveAttribute('aria-expanded', 'false')
    expect(aboutButton()).toHaveTextContent('Optional')
    expect(planningButton()).toHaveTextContent('Main')
  })

  it('a saved Recipe: the summaries say what is inside', async () => {
    api({
      'GET /api/recipes/3': recipe({ id: 3, description: 'A quick weeknight sauce.', source: { url: 'https://www.example.test/a', attribution: '' }, tags: ['roast', 'quick'], cooldownDays: 5, updatedAt: '2026-11-14T10:00:00Z' }),
    })
    mount()
    await ready()
    expect(aboutButton()).toHaveAttribute('aria-expanded', 'false')
    expect(aboutButton()).toHaveTextContent('A quick weeknight sauce. · example.test')
    expect(planningButton()).toHaveAttribute('aria-expanded', 'false')
    expect(planningButton()).toHaveTextContent('Main · roast, quick · Cool-down 5 days')
  })

  it('closed, their fields are out of reach; open, Planning holds Courses, Whole meal, Tags and the four overrides, About holds Description and the source', async () => {
    mount()
    await ready()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: 'Cool-down' })).toBeNull()
    await userEvent.click(aboutButton())
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Source link' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Attribution' })).toBeInTheDocument()
    await userEvent.click(planningButton())
    expect(screen.getByRole('group', { name: 'Courses' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Whole meal' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Tags' })).toBeInTheDocument()
    for (const name of ['Cool-down', 'Leftover Use-by', 'Reheat time', 'Frozen Use-by']) expect(screen.getByRole('spinbutton', { name }), name).toBeInTheDocument()
  })

  it('the four overrides share one footnote with the Household\'s own values, and have no helper text of their own', async () => {
    mount()
    await ready()
    await userEvent.click(planningButton())
    expect(
      await screen.findByText(
        "Leave a field blank to use the Household's setting: Cool-down 7 days, Leftover Use-by 2 days, Frozen Use-by 90 days. Reheat time without a value is worked out from the portions.",
      ),
    ).toBeInTheDocument()
    for (const old of ['Blank uses the household default', 'Days after cooking; 0 means the same day', 'Blank: Reheat works it out from the portions']) {
      expect(screen.queryByText(old), old).toBeNull()
    }
  })

  it('Planning opens by itself when a field in it has an error, and the field takes focus', async () => {
    api({ 'GET /api/recipes/3': recipe({ id: 3, cooldownDays: 400, updatedAt: '2026-11-14T10:00:00Z' }) })
    mount()
    await ready()
    expect(planningButton()).toHaveAttribute('aria-expanded', 'false')
    await save()
    await waitFor(() => expect(planningButton()).toHaveAttribute('aria-expanded', 'true'))
    const cooldown = screen.getByRole('spinbutton', { name: 'Cool-down' })
    await waitFor(() => expect(cooldown).toHaveFocus())
    expect(cooldown).toHaveAttribute('aria-invalid', 'true')
    expect(scratch.callsTo('PUT', '/api/recipes/3')).toHaveLength(0)
  })

  it('"Description and source" opens by itself when the server refuses the Source link', async () => {
    api({ 'PUT /api/recipes/3': { status: 422, json: { error: { code: 'validation_failed', message: 'url_invalid', field: 'source.url', reason: 'url_invalid' } } } })
    mount()
    await ready()
    expect(aboutButton()).toHaveAttribute('aria-expanded', 'false')
    await save()
    await waitFor(() => expect(aboutButton()).toHaveAttribute('aria-expanded', 'true'))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Source link' })).toHaveFocus())
  })

  it('what the person opened is remembered on this device (only which sections are open), and comes back next time', async () => {
    const first = mount()
    await ready()
    await userEvent.click(planningButton())
    expect(JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? 'null')).toEqual([PLANNING])
    first.unmount()
    mount()
    await ready()
    expect(planningButton()).toHaveAttribute('aria-expanded', 'true')
    expect(aboutButton()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(aboutButton())
    expect(JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? 'null').sort()).toEqual([ABOUT, PLANNING].sort())
    await userEvent.click(planningButton())
    expect(JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? 'null')).toEqual([ABOUT])
  })

  it('a hash that names a section opens it', async () => {
    window.location.hash = `#${PLANNING}`
    mount()
    await ready()
    expect(planningButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('opening or closing a section is not a change: the leave guard stays quiet', async () => {
    mount()
    await ready()
    await userEvent.click(planningButton())
    await userEvent.click(aboutButton())
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    expect(await screen.findByRole('heading', { name: 'Plan page' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull()
  })
})

describe('a new Recipe starts typing at once (RX-02)', () => {
  it('the Name has the cursor; on a saved Recipe it does not', async () => {
    mount('/recipes/new')
    await waitFor(() => expect(nameField()).toHaveFocus())
  })

  it('a saved Recipe does not steal focus into the Name', async () => {
    mount()
    await ready()
    expect(nameField()).not.toHaveFocus()
  })

  it('opens with one empty line and one empty Step, no Photo drop zone anywhere', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    expect(within(ingredients()).getAllByRole('combobox', { name: 'Ingredient' })).toHaveLength(1)
    expect(within(steps()).getAllByRole('textbox', { name: 'Step text' })).toHaveLength(1)
    expect(screen.queryByTestId('fake-image-picker')).toBeNull()
  })

  it('the main Course is chosen (the Planning summary starts with it)', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await waitFor(() => expect(planningButton()).toHaveTextContent('Main'))
  })

  it('a fresh editor is clean: leaving it asks nothing', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    expect(await screen.findByRole('heading', { name: 'Plan page' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull()
  })

  it('Save with nothing filled saves nothing and asks for the Name and an Ingredient line, not for the empty rows', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await save()
    await waitFor(() => expect(nameField()).toHaveFocus())
    expect(scratch.callsTo('POST', '/api/recipes')).toHaveLength(0)
    expect(within(ingredients()).getByText('Add at least one ingredient line.')).toBeInTheDocument()
    expect(within(ingredients()).queryByText(/Choose an Ingredient|Enter a quantity|Choose a unit/)).toBeNull()
    expect(within(steps()).queryByText(/Write the Step|step_text/i)).toBeNull()
  })

  it('an untouched empty line and Step are dropped on Save: only what was filled in is sent', async () => {
    mount('/recipes/new')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Aioli')
    await pick(within(ingredients()).getByRole('combobox', { name: 'Ingredient' }), /garlic/)
    await userEvent.type(within(ingredients()).getByRole('textbox', { name: 'Quantity' }), '2')
    await userEvent.type(within(steps()).getByRole('textbox', { name: 'Step text' }), 'Mix')
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Step' }))
    expect(within(ingredients()).getAllByRole('combobox', { name: 'Ingredient' })).toHaveLength(2)
    expect(within(steps()).getAllByRole('textbox', { name: 'Step text' })).toHaveLength(2)
    await save()
    await waitFor(() => expect(scratch.callsTo('POST', '/api/recipes')).toHaveLength(1))
    const body = scratch.callsTo('POST', '/api/recipes')[0]!.body as { lines: unknown[]; steps: { text: string }[] }
    expect(body.lines).toHaveLength(1)
    expect(body.steps.map((s) => s.text)).toEqual(['Mix'])
  })
})

describe('Ingredient lines are quick to fill (RX-02, RX-08, RX-10)', () => {
  it('the captions above the list are Ingredient, Quantity, Unit, Note, Optional; the first track (the handle) has none', async () => {
    mount()
    await ready()
    const head = ingredients().querySelector('.recipe-editor__lines-head')!
    expect(head).toHaveAttribute('aria-hidden', 'true')
    expect([...head.children].map((c) => c.textContent)).toEqual(['', 'Ingredient', 'Quantity', 'Unit', 'Note', 'Optional', ''])
  })

  it('picking an Ingredient moves the cursor to that line\'s Quantity and selects its text', async () => {
    mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    const lines = () => within(ingredients()).getAllByRole('textbox', { name: 'Quantity' }) as HTMLInputElement[]
    await userEvent.type(lines()[1]!, '25')
    await pick(within(ingredients()).getAllByRole('combobox', { name: 'Ingredient' })[1]!, /flour/)
    await waitFor(() => expect(lines()[1]).toHaveFocus())
    expect(lines()[1]!.selectionStart).toBe(0)
    expect(lines()[1]!.selectionEnd).toBe(2)
  })

  it('the same for a Step\'s Ingredient use: the cursor goes to "Quantity used"', async () => {
    mount()
    await ready()
    const first = stepCards()[0]!
    await userEvent.click(within(first).getByRole('button', { name: 'Add ingredient use' }))
    await pick(within(first).getByRole('combobox', { name: 'Ingredient used' }), /flour/)
    await waitFor(() => expect(within(first).getByRole('textbox', { name: 'Quantity used' })).toHaveFocus())
  })

  it('Enter in the Note of the last line adds a line and puts the cursor in its Ingredient picker', async () => {
    mount()
    await ready()
    await userEvent.type(within(ingredients()).getByRole('textbox', { name: 'Note' }), 'sliced{Enter}')
    const pickers = within(ingredients()).getAllByRole('combobox', { name: 'Ingredient' })
    expect(pickers).toHaveLength(2)
    await waitFor(() => expect(pickers[1]).toHaveFocus())
  })

  it('Enter in the Note of a line that is not the last adds nothing', async () => {
    mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    await userEvent.type(within(ingredients()).getAllByRole('textbox', { name: 'Note' })[0]!, 'sliced{Enter}')
    expect(within(ingredients()).getAllByRole('combobox', { name: 'Ingredient' })).toHaveLength(2)
  })

  it('Optional is a checkbox "Optional: garlic" on the line, and what it says is saved', async () => {
    mount()
    await ready()
    await userEvent.click(within(ingredients()).getByRole('checkbox', { name: 'Optional: garlic' }))
    await save()
    await waitFor(() => expect(scratch.callsTo('PUT', '/api/recipes/3')).toHaveLength(1))
    expect((scratch.callsTo('PUT', '/api/recipes/3')[0]!.body as { lines: { optional: boolean }[] }).lines[0]!.optional).toBe(true)
  })

  it('removing a line from its ⋮ menu offers the same Undo as the trash button', async () => {
    mount()
    await ready()
    await userEvent.click(within(ingredients()).getByRole('button', { name: 'Actions for garlic' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove ingredient garlic' }))
    await waitFor(() => expect(toastText()).toContain('Garlic line removed'))
    expect(await screen.findByRole('button', { name: 'Undo: put Garlic line back' })).toBeInTheDocument()
  })
})

describe('a Step card (RX-02, RX-08)', () => {
  it('a Lead time of 720 minutes reads "12 h"; saving without touching it sends 720 again', async () => {
    api({
      'GET /api/recipes/3': recipe({
        id: 3, updatedAt: '2026-11-14T10:00:00Z',
        steps: [{ text: 'Soak the beans', kind: 'advance', durationMinutes: 0, leadTimeMinutes: 720, after: [], uses: [], image: '' }, { text: 'Cook', kind: 'active', durationMinutes: 45, leadTimeMinutes: 0, after: [], uses: [], image: '' }],
      }),
    })
    mount()
    await ready()
    const advance = within(stepCards()[0]!).getByRole('group', { name: 'Lead time' })
    expect(within(advance).getByRole('spinbutton', { name: 'Lead time' })).toHaveValue('12')
    expect(within(advance).getByRole('combobox', { name: 'Lead time unit' })).toHaveTextContent('h')
    expect(within(within(stepCards()[1]!).getByRole('group', { name: 'Duration' })).getByRole('spinbutton', { name: 'Duration' })).toHaveValue('45')
    await save()
    await waitFor(() => expect(scratch.callsTo('PUT', '/api/recipes/3')).toHaveLength(1))
    const sent = (scratch.callsTo('PUT', '/api/recipes/3')[0]!.body as { steps: { leadTimeMinutes: number; durationMinutes: number }[] }).steps
    expect(sent[0]!.leadTimeMinutes).toBe(720)
    expect(sent[1]!.durationMinutes).toBe(45)
  })

  it('Add Step puts the cursor in the new Step\'s text', async () => {
    mount()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Add Step' }))
    const texts = within(steps()).getAllByRole('textbox', { name: 'Step text' })
    expect(texts).toHaveLength(3)
    await waitFor(() => expect(texts[2]).toHaveFocus())
  })

  it('the ⋮ of a Step holds Move up, Move down and Remove Step (a phone has no trash button)', async () => {
    mount()
    await ready()
    await userEvent.click(within(stepCards()[0]!).getByRole('button', { name: 'Step actions' }))
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Move Step up', 'Move Step down', 'Remove Step'])
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Remove Step' }))
    await waitFor(() => expect(toastText()).toContain('Step 1 removed'))
  })

  it('a Step has no Photo picker until "Add Photo" (the saved Recipe\'s second Step has a photo, so it shows one)', async () => {
    api({
      'GET /api/recipes/3': recipe({
        id: 3, updatedAt: '2026-11-14T10:00:00Z',
        steps: [{ text: 'One', kind: 'active', durationMinutes: 5, leadTimeMinutes: 0, after: [], uses: [], image: '' }, { text: 'Two', kind: 'active', durationMinutes: 5, leadTimeMinutes: 0, after: [], uses: [], image: 'abc' }],
      }),
    })
    mount()
    await ready()
    expect(within(stepCards()[0]!).queryByTestId('fake-image-picker')).toBeNull()
    expect(within(stepCards()[1]!).getByTestId('fake-image-picker')).toHaveAttribute('data-value', 'abc')
  })
})

describe('Tags are removable chips and "Add Tag" (RX-09, decision RX 6)', () => {
  it('Planning shows the Recipe\'s Tags as chips "Remove Tag <name>" and an "Add Tag" button; the old Tag text field is gone', async () => {
    mount()
    await ready()
    await userEvent.click(planningButton())
    const tags = screen.getByRole('group', { name: 'Tags' })
    expect(within(tags).getByRole('button', { name: 'Remove Tag roast' })).toHaveAttribute('data-tag-colour', 'tomato')
    expect(within(tags).getByRole('button', { name: 'Add Tag' })).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.queryByRole('combobox', { name: 'Add a Tag' })).toBeNull()
  })

  it('choosing a Tag in the chooser adds a chip; the new Tag is saved with the Recipe, and a removed chip is not', async () => {
    mount()
    await ready()
    await userEvent.click(planningButton())
    await userEvent.click(screen.getByRole('button', { name: 'Add Tag' }))
    const dialog = screen.getByRole('dialog', { name: 'Tags' })
    await userEvent.click(within(dialog).getByRole('option', { name: /^family/ }))
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Search or add a Tag' }), 'brand new{Enter}')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Tag roast' }))
    expect(screen.getByRole('button', { name: 'Remove Tag brand new' })).toHaveTextContent('New')
    await save()
    await waitFor(() => expect(scratch.callsTo('PUT', '/api/recipes/3')).toHaveLength(1))
    expect((scratch.callsTo('PUT', '/api/recipes/3')[0]!.body as { tags: string[] }).tags).toEqual(['family', 'brand new'])
  })

  it('the Tags are in the Planning summary: three and "+N"', async () => {
    api({ 'GET /api/recipes/3': recipe({ id: 3, tags: ['roast', 'quick', 'family', 'extra'], updatedAt: '2026-11-14T10:00:00Z' }) })
    mount()
    await ready()
    expect(planningButton()).toHaveTextContent('Main · roast, quick, family +1')
  })
})
