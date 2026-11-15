// RX-04 + RX-14: the Ingredient lines are R-E rows: name (dt, body-strong), quantity at the end (dd, tabular), the outlined ⋮ last (dd), the muted
// detail underneath (dd). The list stays a description list.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { garlic } from '../fixtures.test-helper'
import type { RecipeLine } from '../types'
import { IngredientLinesList } from './IngredientLinesList'

const refs = new Map([[7, garlic]])
const line = (over: Partial<RecipeLine> = {}): RecipeLine => ({ ingredientId: 7, ingredient: 'garlic', quantity: 3, unit: 'clove', optional: false, note: '', ...over })
const view = (lines: RecipeLine[], extra: { onLinkToBase?: () => void } = {}) =>
  render(
    <MemoryRouter>
      <IngredientLinesList lines={lines} refs={refs} system="metric" {...extra} />
    </MemoryRouter>,
  )
const rows = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.ingredient-lines__row'))

describe('IngredientLinesList: a description list of rows', () => {
  it('is a dl with a row per line, no bullets', () => {
    const { container } = view([line(), line({ ingredientId: 8, ingredient: 'flour', quantity: 200, unit: 'g' })])
    expect(container.querySelector('dl.ingredient-lines')).not.toBeNull()
    expect(container.querySelector('ul > li')).toBeNull()
    expect(rows(container)).toHaveLength(2)
  })
  it('the name is the dt (display form), the quantity a dd; they are separate cells', () => {
    const { container } = view([line()])
    const row = rows(container)[0]!
    const name = row.querySelector(':scope > dt') as HTMLElement
    expect(name).toHaveClass('ingredient-lines__name')
    expect(name).toHaveTextContent('Garlic')
    const qty = row.querySelector(':scope > dd.ingredient-lines__quantity') as HTMLElement
    expect(qty).toHaveTextContent('3 clove')
    expect(name).not.toBe(qty)
  })
  it('puts the cells in DOM order: name, quantity, actions, detail (so the keyboard follows the row)', () => {
    const { container } = view([line({ optional: true, note: 'crushed' })], { onLinkToBase: vi.fn() })
    const row = rows(container)[0]!
    expect(Array.from(row.children).map((c) => c.className.split(' ')[0])).toEqual([
      'ingredient-lines__name',
      'ingredient-lines__quantity',
      'ingredient-lines__actions',
      'ingredient-lines__detail',
    ])
  })
  it('a line without actions has no actions cell (the CSS keeps its track, so the quantities line up)', () => {
    const { container } = view([line()])
    expect(rows(container)[0]!.querySelector('.ingredient-lines__actions')).toBeNull()
  })
})

describe('IngredientLinesList: the detail under the name (RX-04)', () => {
  it('is "Optional · <note>" for an optional line with a note', () => {
    const { container } = view([line({ optional: true, note: 'crushed' })])
    expect(rows(container)[0]!.querySelector('.ingredient-lines__detail')).toHaveTextContent('Optional · crushed')
  })
  it('is the note alone, or "Optional" alone', () => {
    const { container } = view([line({ note: 'finely sliced' }), line({ optional: true })])
    const [a, b] = rows(container)
    expect(a!.querySelector('.ingredient-lines__detail')).toHaveTextContent(/^finely sliced$/)
    expect(b!.querySelector('.ingredient-lines__detail')).toHaveTextContent(/^Optional$/)
  })
  it('is absent when the line has neither', () => {
    const { container } = view([line()])
    expect(rows(container)[0]!.querySelector('.ingredient-lines__detail')).toBeNull()
  })
  it('has no separate "optional" tag and no run-together note: the detail is one muted line', () => {
    const { container } = view([line({ optional: true, note: 'crushed' })])
    expect(container.querySelector('.ingredient-lines__tag, .ingredient-lines__note')).toBeNull()
    expect(screen.queryByText('optional')).toBeNull()
  })
})

describe('IngredientLinesList: the line actions at the row\'s end (RX-14)', () => {
  it('the ⋮ is a dd after the quantity, named "Actions for <name>"', () => {
    const { container } = view([line()], { onLinkToBase: vi.fn() })
    const row = rows(container)[0]!
    const actions = row.querySelector(':scope > dd.ingredient-lines__actions') as HTMLElement
    expect(within(actions).getByRole('button', { name: 'Actions for garlic' })).toBeInTheDocument()
    const order = Array.from(row.children)
    expect(order.indexOf(actions)).toBeGreaterThan(order.indexOf(row.querySelector('.ingredient-lines__quantity')!))
  })
  it('nothing leads the row: the name is its first child, the ⋮ no longer starts it', () => {
    const { container } = view([line()], { onLinkToBase: vi.fn() })
    const row = rows(container)[0]!
    expect(row.firstElementChild).toHaveClass('ingredient-lines__name')
  })
})
