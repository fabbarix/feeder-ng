// BR-E (design §11.3): one tile per marked or matched line, asking "Is this another recipe?" with a crafted radio group. RED until the component exists.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders, summaryJSON } from '../../../lib/baseRecipes/test-utils'
import { baseLine, fileSuggestion, plannableSuggestion, takeOver, useSuggestion } from '../fixtures.baseRecipes.test-helper'
import { plan } from '../fixtures.test-helper'
import { baseRecipeRows } from '../lib/baseRecipeLines'
import type { BaseRecipeLine, ImportTakeOverAsk, Problem, Warning } from '../types'
import { BaseRecipeLineTile } from './BaseRecipeLineTile'

function show(line: Partial<BaseRecipeLine> = {}, extra: { ask?: ImportTakeOverAsk; problems?: Problem[]; warnings?: Warning[] } = {}) {
  const row = baseRecipeRows(plan({ baseRecipeLines: [baseLine(line)] }))[0]!
  const on = { onAnswer: vi.fn(), onConvert: vi.fn(), onTakeOver: vi.fn() }
  renderWithProviders(<BaseRecipeLineTile row={row} ask={extra.ask} problems={extra.problems ?? []} warnings={extra.warnings ?? []} {...on} />)
  return on
}
const suggestions = [useSuggestion(3, 'Béchamel', false), fileSuggestion(1, 'Roux', false), plannableSuggestion(7, 'Pesto')]

describe('BaseRecipeLineTile', () => {
  it('is a region named after the line as read, with the cue, and asks "Is this another recipe?"', () => {
    show({ cue: 'see page 42' })
    const tile = screen.getByRole('region', { name: '500 ml béchamel · see page 42' })
    expect(within(tile).getByRole('heading', { name: 'Is this another recipe?' })).toBeInTheDocument()
    expect(within(tile).getByRole('radiogroup', { name: 'Is this another recipe?' })).toBeInTheDocument()
  })

  it('offers each answer as a radio, in order', () => {
    show({ suggestions })
    const names = screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.textContent ?? '')
    expect(names).toEqual([
      expect.stringContaining('Use Base recipe Béchamel'),
      expect.stringContaining('Use Roux from this import'),
      expect.stringContaining('Add it as a new Base recipe · Fill in later'),
      expect.stringContaining('Add it as a new Base recipe · Read it next'),
      expect.stringContaining('Turn Pesto into a Base recipe'),
      expect.stringContaining('Keep it as an Ingredient'),
    ])
  })

  it('checks the answer in force; a preselected exact match is shown like any other', () => {
    show({ suggestions: [useSuggestion(3, 'Béchamel')], effective: { action: 'use', recipeId: 3 }, resolved: true })
    expect(screen.getByRole('radio', { name: /Use Base recipe Béchamel/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Keep it as an Ingredient/ })).not.toBeChecked()
  })

  it('shows nothing checked and says it needs an answer while the tile is open', () => {
    show({ suggestions })
    expect(screen.queryByRole('radio', { checked: true })).toBeNull()
    expect(screen.getByText('Needs an answer')).toBeInTheDocument()
  })

  it('does not say it needs an answer once answered', () => {
    show({ effective: { action: 'keep' }, resolved: true })
    expect(screen.queryByText('Needs an answer')).toBeNull()
  })

  it.each([
    [/Use Base recipe Béchamel/, { action: 'use', recipeId: 3 }],
    [/Use Roux from this import/, { action: 'file', recipeIndex: 1 }],
    [/Fill in later/, { action: 'create' }],
    [/Read it next/, { action: 'create', readNext: true }],
    [/Keep it as an Ingredient/, { action: 'keep' }],
  ])('choosing %s answers %j', async (name, decision) => {
    const on = show({ suggestions })
    await userEvent.click(screen.getByRole('radio', { name }))
    expect(on.onAnswer).toHaveBeenCalledWith(decision)
  })

  it('choosing a plannable Recipe answers nothing yet: it asks the convert dialog first', async () => {
    const on = show({ suggestions })
    await userEvent.click(screen.getByRole('radio', { name: /Turn Pesto into a Base recipe/ }))
    expect(on.onConvert).toHaveBeenCalledWith({ id: 7, name: 'Pesto' })
    expect(on.onAnswer).not.toHaveBeenCalled()
  })

  it('shows the plain Ingredient of the same name beside Keep it as an Ingredient', () => {
    show({ keepIngredient: { id: 5, name: 'béchamel', baseUnit: 'ml' } })
    const keep = screen.getByRole('radio', { name: /Keep it as an Ingredient/ })
    expect(keep).toHaveAccessibleName(expect.stringContaining('béchamel'))
  })

  describe('keyboard (arrows move the focus; Space or Enter answers; a click answers)', () => {
    const sug = [useSuggestion(3, 'Béchamel', false), fileSuggestion(1, 'Roux', false), plannableSuggestion(7, 'Pesto')]
    const arrowTo = async (n: number) => {
      screen.getByRole('radio', { name: /Use Base recipe Béchamel/ }).focus()
      await userEvent.keyboard('{ArrowDown}'.repeat(n))
    }

    it('the group has one tab stop', () => {
      show({ suggestions: sug, effective: { action: 'use', recipeId: 3 }, resolved: true })
      expect(screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)).toHaveLength(1)
    })

    it('arrowing between the answers sends nothing, but moves the focus', async () => {
      const on = show({ suggestions: sug, effective: { action: 'use', recipeId: 3 }, resolved: true })
      await arrowTo(1)
      expect(screen.getByRole('radio', { name: /Use Roux from this import/ })).toHaveFocus()
      await userEvent.keyboard('{ArrowDown}{ArrowDown}')
      expect(screen.getByRole('radio', { name: /Read it next/ })).toHaveFocus()
      expect(on.onAnswer).not.toHaveBeenCalled()
      expect(on.onConvert).not.toHaveBeenCalled()
    })

    it('Space answers with the focused option', async () => {
      const on = show({ suggestions: sug, effective: { action: 'use', recipeId: 3 }, resolved: true })
      await arrowTo(1)
      await userEvent.keyboard(' ')
      expect(on.onAnswer).toHaveBeenCalledTimes(1)
      expect(on.onAnswer).toHaveBeenCalledWith({ action: 'file', recipeIndex: 1 })
    })

    it('Enter answers with the focused option', async () => {
      const on = show({ suggestions: sug, effective: { action: 'use', recipeId: 3 }, resolved: true })
      await arrowTo(3)
      await userEvent.keyboard('{Enter}')
      expect(on.onAnswer).toHaveBeenCalledWith({ action: 'create', readNext: true })
    })

    it('arrowing onto the convert option does not ask the convert dialog, and sends no answer', async () => {
      const on = show({ suggestions: sug, effective: { action: 'use', recipeId: 3 }, resolved: true })
      await arrowTo(4)
      expect(screen.getByRole('radio', { name: /Turn Pesto into a Base recipe/ })).toHaveFocus()
      expect(on.onConvert).not.toHaveBeenCalled()
      expect(on.onAnswer).not.toHaveBeenCalled()
    })

    it.each([[' '], ['{Enter}']])('%j on the convert option asks the convert dialog', async (key) => {
      const on = show({ suggestions: sug, effective: { action: 'use', recipeId: 3 }, resolved: true })
      await arrowTo(4)
      await userEvent.keyboard(key)
      expect(on.onConvert).toHaveBeenCalledTimes(1)
      expect(on.onConvert).toHaveBeenCalledWith({ id: 7, name: 'Pesto' })
      expect(on.onAnswer).not.toHaveBeenCalled()
    })

    it('the take-over ask follows the same rule: arrowing sends nothing, Space answers', async () => {
      const on = show({ effective: { action: 'create' }, resolved: true }, { ask: takeOver() })
      screen.getByRole('radio', { name: 'Yes, take it over' }).focus()
      await userEvent.keyboard('{ArrowDown}')
      expect(screen.getByRole('radio', { name: 'No, keep it apart' })).toHaveFocus()
      expect(on.onTakeOver).not.toHaveBeenCalled()
      await userEvent.keyboard(' ')
      expect(on.onTakeOver).toHaveBeenCalledWith(false)
    })
  })

  describe('Choose another', () => {
    const routes = () => ({
      'GET /api/recipes?kind=base': [summaryJSON({ id: 3, name: 'Béchamel' }), summaryJSON({ id: 4, name: 'Stock', yield: 2, yieldUnit: 'l' })],
      'GET /api/recipes': [summaryJSON({ id: 7, name: 'Pesto', baseRecipe: false, yieldUnit: null, yield: 4 })],
    })

    it('opens the shared Base recipe picker (search, recipe badge, plannable group)', async () => {
      mockApi(routes())
      show({ suggestions })
      await userEvent.click(screen.getByRole('button', { name: 'Choose another' }))
      expect(await screen.findByRole('dialog', { name: 'Link to a Base recipe' })).toBeInTheDocument()
      expect(await screen.findByRole('option', { name: /^Stock,/ })).toBeInTheDocument()
      await userEvent.type(screen.getByRole('combobox', { name: 'Search Base recipes' }), 'pes')
      expect(screen.getByRole('group', { name: 'Recipes you plan' })).toBeInTheDocument()
    })

    it('picking a Base recipe answers use with it', async () => {
      mockApi(routes())
      const on = show({ suggestions })
      await userEvent.click(screen.getByRole('button', { name: 'Choose another' }))
      await userEvent.click(await screen.findByRole('option', { name: /^Stock,/ }))
      expect(on.onAnswer).toHaveBeenCalledWith({ action: 'use', recipeId: 4 })
    })

    it('picking a plannable Recipe asks the convert dialog', async () => {
      mockApi(routes())
      const on = show({ suggestions })
      await userEvent.click(screen.getByRole('button', { name: 'Choose another' }))
      await userEvent.type(await screen.findByRole('combobox', { name: 'Search Base recipes' }), 'pes')
      await userEvent.click(await screen.findByRole('option', { name: 'Pesto' }))
      expect(on.onConvert).toHaveBeenCalledWith({ id: 7, name: 'Pesto' })
    })

    it('gives the focus back to the button when the picker closes', async () => {
      mockApi(routes())
      show({ suggestions })
      const button = screen.getByRole('button', { name: 'Choose another' })
      await userEvent.click(button)
      await screen.findByRole('dialog', { name: 'Link to a Base recipe' })
      await userEvent.keyboard('{Escape}')
      expect(button).toHaveFocus()
    })
  })

  describe('Problems and warnings', () => {
    it('announces a Problem on the tile (an alert) and links it to the group', () => {
      show({ suggestions }, { problems: [{ path: '$.recipes[0].ingredients[1]', code: 'base_recipe_answer_invalid', message: 'this answer does not fit the line: choose a Recipe of this file' }] })
      const alert = within(screen.getByRole('region', { name: '500 ml béchamel' })).getByRole('alert')
      expect(alert).toHaveTextContent('this answer does not fit the line: choose a Recipe of this file')
      const group = screen.getByRole('radiogroup', { name: 'Is this another recipe?' })
      expect(group.getAttribute('aria-describedby') ?? '').toContain(alert.id)
    })

    it('shows only the Problems of its own path', () => {
      show({}, { problems: [{ path: '$.recipes[3].ingredients[0]', code: 'x', message: 'someone else\'s' }] })
      expect(within(screen.getByRole('region', { name: '500 ml béchamel' })).queryByRole('alert')).toBeNull()
    })

    it('asks the Yield of a Recipe of the file that is not marked as a Base recipe, when the server says it needs one', async () => {
      const on = show(
        { suggestions: [fileSuggestion(1, 'Roux', false)], effective: { action: 'file', recipeIndex: 1 } },
        { problems: [{ path: '$.recipes[0].ingredients[1]', code: 'base_recipe_answer_invalid', message: 'this answer does not fit the line: a Recipe that is not marked as a Base recipe needs a Yield and its unit' }] },
      )
      const amount = screen.getByRole('spinbutton', { name: 'Yield' })
      await userEvent.clear(amount)
      await userEvent.type(amount, '2{Enter}')
      await userEvent.click(screen.getByRole('button', { name: 'Set Yield' }))
      expect(on.onAnswer).toHaveBeenCalledWith({ action: 'file', recipeIndex: 1, yield: 2, yieldUnit: 'portion' })
    })
  })
})

describe('BaseRecipeLineTile, the take-over ask (P7 = B)', () => {
  const create = { suggestions: [], effective: { action: 'create' as const }, resolved: true }

  it('asks inside the tile, naming the Ingredient, its Recipes and Stock', () => {
    show(create, { ask: takeOver() })
    const tile = screen.getByRole('region', { name: '500 ml béchamel' })
    expect(within(tile).getByText(/An Ingredient named béchamel exists\. It is on Moussaka and Lasagne, and 1 Stock Lot of it is in the Pantry\./)).toBeInTheDocument()
    expect(within(tile).getByRole('radiogroup', { name: /Should the new Base recipe Béchamel take it over\?/ })).toBeInTheDocument()
  })

  it('nothing is preselected; Yes answers true, No answers false', async () => {
    const on = show(create, { ask: takeOver() })
    expect(screen.getByRole('radio', { name: 'Yes, take it over' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'No, keep it apart' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Yes, take it over' }))
    await userEvent.click(screen.getByRole('radio', { name: 'No, keep it apart' }))
    expect(on.onTakeOver.mock.calls).toEqual([[true], [false]])
  })

  it('shows the answer in force', () => {
    show(create, { ask: takeOver({ answer: true, resolved: true }) })
    expect(screen.getByRole('radio', { name: 'Yes, take it over' })).toBeChecked()
  })

  it('does not offer Yes when the Yield does not convert; the server\'s warning says why and No is in force', () => {
    show(create, {
      ask: takeOver({ convertible: false, resolved: true, answer: false }),
      warnings: [{ path: '$.recipes[0].ingredients[1]', code: 'same_name_ingredient', message: 'A plain Ingredient named béchamel (g) stays apart: Béchamel is measured in ml' }],
    })
    expect(screen.queryByRole('radio', { name: 'Yes, take it over' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'No, keep it apart' })).toBeChecked()
    expect(screen.getByText('A plain Ingredient named béchamel (g) stays apart: Béchamel is measured in ml')).toBeInTheDocument()
  })

  it('has no ask when the server returns none', () => {
    show(create)
    expect(screen.queryByText(/An Ingredient named/)).toBeNull()
  })

  it('an unanswered ask keeps the tile open', () => {
    show(create, { ask: takeOver() })
    expect(screen.getByText('Needs an answer')).toBeInTheDocument()
  })
})
