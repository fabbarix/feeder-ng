// B9-28 (RX-01, decision RX 3): the "Recipes" tile of Import Review: one R-E row per Recipe of the file, read-only. A misread is
// corrected with Edit on the imported Recipe afterwards, so nothing here edits a field.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { preview, recipe } from '../fixtures.test-helper'
import type { RecipeStatus } from '../types'
import { RecipePreviewList } from './RecipePreviewList'

const tikka = recipe({
  index: 0, name: 'Chicken tikka traybake',
  preview: preview({
    yield: 4, courses: ['Main'], tags: ['chicken', 'traybake'], source: { url: 'https://example.test/tikka' },
    lines: [
      { quantity: 800, unit: 'g', ingredient: 'chicken thighs', note: 'boneless, skinless', optional: false },
      { quantity: 1, unit: 'piece', ingredient: 'lemon', optional: true },
    ],
    steps: [
      { text: 'Marinate the chicken.', kind: 'advance', durationMinutes: 10, leadTimeMinutes: 240 },
      { text: 'Roast until golden.', kind: 'passive', durationMinutes: 25, leadTimeMinutes: 0 },
    ],
  }),
})
const lasagne = recipe({ index: 1, name: 'Lasagne (ready meal)', preview: preview({ readyMeal: true, yield: 2, courses: ['Main'], lines: [], steps: [] }) })
const lasagneConflict = recipe({ ...lasagne, status: 'conflict', existingId: 77, resolved: false })

const show = (recipes: RecipeStatus[]) => {
  const onChoose = vi.fn()
  const view = render(
    <MemoryRouter>
      <RecipePreviewList recipes={recipes} onChoose={onChoose} />
    </MemoryRouter>,
  )
  return { onChoose, ...view }
}
const row = (name: string) => screen.getByRole('listitem', { name: new RegExp(name) })

describe('RecipePreviewList', () => {
  it('is a tile titled Recipes, with the count to import in its meta', () => {
    show([tikka, lasagne])
    expect(screen.getByRole('heading', { name: 'Recipes' })).toBeInTheDocument()
    expect(screen.getByText('2 to import')).toBeInTheDocument()
  })
  it('counts the skipped Recipes in the meta: "2 to import, 1 skipped"', () => {
    show([tikka, lasagne, recipe({ index: 2, name: 'Soup', status: 'conflict', resolved: true, action: 'skip' })])
    expect(screen.getByText('2 to import, 1 skipped')).toBeInTheDocument()
  })
  it('has one row per Recipe with its name, its detail line and its state', () => {
    show([tikka, lasagne])
    expect(screen.getAllByRole('listitem').filter((li) => li.classList.contains('list-row'))).toHaveLength(2)
    expect(within(row('Chicken tikka traybake')).getByText('4 portions · 2 Ingredients · 2 Steps · Main')).toBeInTheDocument()
    expect(within(row('Chicken tikka traybake')).getByText('New')).toBeInTheDocument()
    expect(within(row('Lasagne')).getByText('Ready Meal · 2 portions')).toBeInTheDocument()
  })
  it('shows the state as text, never as a coloured chip', () => {
    const { container } = show([tikka])
    expect(container.querySelector('.chip')).toBeNull()
  })
  it('gives each row an outlined expand button named "Show <name>" with aria-expanded and aria-controls', () => {
    show([tikka, lasagne, recipe({ index: 2, name: 'Soup' })])
    const button = screen.getByRole('button', { name: 'Show Chicken tikka traybake' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls')
    expect(document.getElementById(button.getAttribute('aria-controls')!)).not.toBeNull()
  })

  describe('the panel', () => {
    it('starts expanded for the first Recipe when the file holds one or two Recipes', () => {
      show([tikka, lasagne])
      expect(screen.getByRole('button', { name: 'Hide Chicken tikka traybake' })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('button', { name: 'Show Lasagne (ready meal)' })).toHaveAttribute('aria-expanded', 'false')
    })
    it('starts with every row collapsed when the file holds three or more Recipes', () => {
      show([tikka, lasagne, recipe({ index: 2, name: 'Soup' })])
      for (const b of screen.getAllByRole('button', { name: /^Show / })) expect(b).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('button', { name: /^Hide / })).not.toBeInTheDocument()
    })
    it('opens and closes with its button', async () => {
      show([tikka, lasagne, recipe({ index: 2, name: 'Soup' })])
      await userEvent.click(screen.getByRole('button', { name: 'Show Chicken tikka traybake' }))
      expect(screen.getByRole('button', { name: 'Hide Chicken tikka traybake' })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Marinate the chicken.')).toBeVisible()
      await userEvent.click(screen.getByRole('button', { name: 'Hide Chicken tikka traybake' }))
      expect(screen.getByText('Marinate the chicken.')).not.toBeVisible()
    })
    it('lists the Ingredients as rows: the name, the quantity as state, the note or Optional as detail', () => {
      show([tikka])
      const chicken = screen.getByText(/^chicken thighs$/i).closest('li') as HTMLElement
      expect(within(chicken).getByText('800 g')).toBeInTheDocument()
      expect(within(chicken).getByText('boneless, skinless')).toBeInTheDocument()
      const lemon = screen.getByText(/^lemon$/i).closest('li') as HTMLElement
      expect(within(lemon).getByText('1 piece')).toBeInTheDocument()
      expect(within(lemon).getByText('Optional')).toBeInTheDocument()
    })
    it('lists every Step as a numbered row: the number, the text, the time as state, the kind as detail', () => {
      show([tikka])
      const first = screen.getByText('Marinate the chicken.').closest('li') as HTMLElement
      expect(within(first).getByText('1')).toBeInTheDocument()
      expect(within(first).getByText('4 h before')).toBeInTheDocument()
      expect(within(first).getByText('Advance')).toBeInTheDocument()
      const second = screen.getByText('Roast until golden.').closest('li') as HTMLElement
      expect(within(second).getByText('2')).toBeInTheDocument()
      expect(within(second).getByText('25 min')).toBeInTheDocument()
      expect(within(second).getByText('Passive')).toBeInTheDocument()
    })
    it('shows the Ingredients and Steps as DetailRows (R-E rows), never as bullet sentences', () => {
      const { container } = show([tikka])
      expect(container.querySelectorAll('.detail-row').length).toBeGreaterThanOrEqual(4)
    })
    it('ends with the meta line: Courses, Tags and the Source host', () => {
      show([tikka])
      expect(screen.getByText('Courses: Main · Tags: chicken, traybake · Source: example.test')).toBeInTheDocument()
    })
    it('is read-only: no field, no editable control, no Edit button in the review', async () => {
      show([tikka])
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /^Edit/ })).not.toBeInTheDocument()
    })
  })

  describe('a Recipe that already exists', () => {
    it('shows Choose in the info tone and "Already exists" on its row, never a separate conflict tile', () => {
      const { container } = show([tikka, lasagneConflict])
      const r = row('Lasagne')
      expect(within(r).getByText('Choose')).toBeInTheDocument()
      expect(within(r).getByText('Already exists')).toBeInTheDocument()
      expect(container.querySelector('[data-status="danger"], [data-status="spoil"]')).toBeNull()
    })
    it('offers Replace, Keep both and Skip as pressable chips in a group named after the Recipe, none pressed until answered', () => {
      show([tikka, lasagneConflict])
      const group = screen.getByRole('group', { name: 'What to do with Lasagne (ready meal)' })
      for (const name of ['Replace', 'Keep both', 'Skip']) {
        expect(within(group).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
      }
    })
    it('presses the chip of the answer given, with the others released', () => {
      show([tikka, recipe({ ...lasagneConflict, resolved: true, action: 'keep_both', importedAs: 'Lasagne (ready meal) (2)' })])
      const group = screen.getByRole('group', { name: 'What to do with Lasagne (ready meal)' })
      expect(within(group).getByRole('button', { name: 'Keep both' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(group).getByRole('button', { name: 'Replace' })).toHaveAttribute('aria-pressed', 'false')
      expect(within(row('Lasagne')).getByText('Kept as Lasagne (ready meal) (2)')).toBeInTheDocument()
    })
    it('answers with the Recipe index and the action', async () => {
      const { onChoose } = show([tikka, lasagneConflict])
      const group = screen.getByRole('group', { name: 'What to do with Lasagne (ready meal)' })
      await userEvent.click(within(group).getByRole('button', { name: 'Replace' }))
      expect(onChoose).toHaveBeenCalledWith(1, 'replace')
      await userEvent.click(within(group).getByRole('button', { name: 'Skip' }))
      expect(onChoose).toHaveBeenLastCalledWith(1, 'skip')
    })
    it('links to the existing Recipe in a new tab', () => {
      show([tikka, lasagneConflict])
      const link = screen.getByRole('link', { name: /Open the existing Recipe/ })
      expect(link).toHaveAttribute('href', '/recipes/77')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    })
    it('has no group of chips on a Recipe that is new', () => {
      show([tikka, lasagne])
      expect(screen.queryByRole('group', { name: /What to do with/ })).not.toBeInTheDocument()
    })
  })

  it('titles each row with the Recipe name, and the title can take focus (tabindex -1) so a jump to the question lands on it', () => {
    show([tikka, lasagneConflict])
    const title = screen.getByText('Lasagne (ready meal)', { selector: '.list-row__title, .list-row__title *' })
    expect(title.closest('[tabindex="-1"]')).not.toBeNull()
  })
})
