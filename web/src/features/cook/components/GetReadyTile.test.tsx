// B9-45 (PC-05): the "Get ready" tile: the Ingredients scaled to the planned portions, a checkbox, the name in bold, the Storage Place muted
// under it, the amount at the end. Ticking mutes a row and strikes the name through; it is local and changes no Stock.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReadySection } from '../lib/ingredients'
import { GetReadyTile } from './GetReadyTile'

const row = (key: string, name: string, amount: string, place: string | null, optional = false) => ({ key, ingredientId: Number(key), name, amount, place, optional })
const sections: ReadySection[] = [
  { key: 's', title: null, rows: [row('1', 'Chicken', '1.2 kg', 'Fridge'), row('2', 'Rice', '300 g', 'Pantry'), row('3', 'Salt', '1 tsp', null)] },
]
const meta = 'For 2.75 portions: 1 Batch of 4 portions, 1.25 kept as a Leftover'
const view = (over: Partial<Parameters<typeof GetReadyTile>[0]> = {}) => {
  const onToggle = vi.fn()
  const out = render(<GetReadyTile sections={sections} meta={meta} ticked={new Set()} onToggle={onToggle} {...over} />)
  return { onToggle, ...out }
}

describe('GetReadyTile', () => {
  it('is an article named "Get ready" with the title and the meta line', () => {
    view()
    const tile = screen.getByRole('article', { name: 'Get ready' })
    expect(within(tile).getByRole('heading', { name: 'Get ready' })).toBeInTheDocument()
    expect(within(tile).getByText(meta)).toBeInTheDocument()
  })

  it('has a row per Ingredient: the name as the title, the Storage Place in the row\'s meta, the amount in the value column', () => {
    const { container } = view()
    const rows = [...container.querySelectorAll('li.list-row')]
    expect(rows).toHaveLength(3)
    expect(rows[0]!.querySelector('.list-row__title')).toHaveTextContent('Chicken')
    expect(rows[0]!.querySelector('.list-row__meta')).toHaveTextContent('Fridge')
    expect(rows[0]!.querySelector('.list-row__value')).toHaveTextContent('1.2 kg')
    expect(rows[2]!.querySelector('.list-row__meta')).toBeNull()
  })

  it('names each checkbox with the Ingredient and its amount: "Chicken, 1.2 kg"', () => {
    view()
    expect(screen.getByRole('checkbox', { name: 'Chicken, 1.2 kg' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Salt, 1 tsp' })).toBeInTheDocument()
  })

  it('ticking a row reports its key; a ticked row is checked, muted and its name struck through', async () => {
    const { onToggle, container } = view({ ticked: new Set(['2']) })
    expect(screen.getByRole('checkbox', { name: 'Rice, 300 g' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Chicken, 1.2 kg' })).not.toBeChecked()
    const done = container.querySelector('li.list-row[data-ticked="true"]')!
    expect(done).toHaveTextContent('Rice')
    expect(container.querySelectorAll('li.list-row[data-ticked="true"]')).toHaveLength(1)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Chicken, 1.2 kg' }))
    expect(onToggle).toHaveBeenCalledWith('1')
  })

  it('uses our own checkbox, never a bare native input without a label', () => {
    view()
    for (const box of screen.getAllByRole('checkbox')) expect(box).toHaveAccessibleName()
  })

  it('groups a timeline\'s Ingredients under a subheader per Course', () => {
    const two: ReadySection[] = [
      { key: 'a', title: 'Main · Roast chicken', rows: [row('1', 'Chicken', '1.2 kg', 'Fridge')] },
      { key: 'b', title: 'Side · Green beans', rows: [row('2', 'Beans', '400 g', 'Fridge')] },
    ]
    view({ sections: two })
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Main · Roast chicken', 'Side · Green beans'])
    expect(screen.getAllByRole('list')).toHaveLength(2)
  })

  it('one Recipe has no subheader', () => {
    view()
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
  })

  it('has no buttons of its own (Start cooking is the nav\'s)', () => {
    view()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
