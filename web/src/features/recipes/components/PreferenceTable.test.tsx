import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { anna, ben, cara } from '../household.test-helper'
import type { PreferenceRow } from '../lib/preferenceRows'
import { PreferenceTable, type PreferenceTableProps } from './PreferenceTable'

const row = (member: PreferenceRow['member'], over: Partial<PreferenceRow> = {}): PreferenceRow => ({ member, you: false, state: 'none', via: [], ...over })
const rows = [row(anna, { you: true, state: 'dislike' }), row(ben), row(cara)]

const view = (over: Partial<PreferenceTableProps> = {}) => {
  const onToggle = vi.fn()
  const utils = render(
    <MemoryRouter>
      <PreferenceTable recipeName="Bolognese" rows={rows} onToggle={onToggle} {...over} />
    </MemoryRouter>,
  )
  return { onToggle, ...utils }
}
const rowOf = (name: string) => screen.getByRole('rowheader', { name: new RegExp(name) }).closest('tr') as HTMLElement

describe('PreferenceTable: structure', () => {
  it('is a real table named by a caption, not a grid', () => {
    view()
    expect(screen.getByRole('table', { name: 'Preferences for Bolognese' })).toBeInTheDocument()
    expect(document.querySelector('table > caption')).toHaveTextContent('Preferences for Bolognese')
    expect(screen.queryByRole('grid')).toBeNull()
  })
  it('has the column headers Member, Favourite, Dislike and Exclusion, each with scope col and an icon on the states', () => {
    view()
    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((h) => h.textContent?.trim())).toEqual(['Member', 'Favourite', 'Dislike', 'Exclusion'])
    for (const h of headers) expect(h).toHaveAttribute('scope', 'col')
    for (const h of headers.slice(1)) expect(h.querySelector('svg')).not.toBeNull()
  })
  it('has one row per Member with a row header holding the Avatar and the name', () => {
    view()
    const heads = screen.getAllByRole('rowheader')
    expect(heads.map((h) => h.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Anna'), expect.stringContaining('Ben'), expect.stringContaining('Cara')]))
    expect(heads).toHaveLength(3)
    for (const h of heads) expect(h).toHaveAttribute('scope', 'row')
    expect(within(heads[1]!).getByRole('img', { name: 'Ben' })).toBeInTheDocument()
    expect(within(heads[1]!).getByText('Ben')).toBeInTheDocument()
  })
  it('keeps the order of the rows it is given and marks the linked Member\'s row You', () => {
    view()
    expect(screen.getAllByRole('rowheader').map((h) => /Anna|Ben|Cara/.exec(h.textContent ?? '')![0])).toEqual(['Anna', 'Ben', 'Cara'])
    expect(within(rowOf('Anna')).getByText('You')).toBeInTheDocument()
    expect(within(rowOf('Ben')).queryByText('You')).toBeNull()
  })
  it('gives each row the id preference-member-<memberId> for the links that point at it', () => {
    view()
    expect(rowOf('Ben')).toHaveAttribute('id', 'preference-member-2')
    expect(rowOf('Cara')).toHaveAttribute('id', 'preference-member-3')
  })
  it('highlights the row a link points at, and no other', () => {
    view({ highlightedMemberId: 2 })
    expect(rowOf('Ben')).toHaveAttribute('data-highlighted', 'true')
    expect(rowOf('Anna')).not.toHaveAttribute('data-highlighted', 'true')
  })
  it('uses the table class the phone layout contract names', () => {
    view()
    expect(screen.getByRole('table')).toHaveClass('preference-table')
  })
})

describe('PreferenceTable: the state buttons', () => {
  it('has a button per Member and state named "Sam: Dislike" with aria-pressed from the state', () => {
    view()
    for (const name of ['Anna', 'Ben', 'Cara']) for (const state of ['Favourite', 'Dislike', 'Exclusion']) expect(screen.getByRole('button', { name: `${name}: ${state}` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anna: Dislike' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Anna: Favourite' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Ben: Dislike' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('button')).toHaveLength(9)
  })
  it('puts each button in its state\'s column, with an icon and no visible text', () => {
    view()
    const cells = within(rowOf('Ben')).getAllByRole('cell')
    expect(within(cells[0]!).getByRole('button', { name: 'Ben: Favourite' })).toBeInTheDocument()
    expect(within(cells[1]!).getByRole('button', { name: 'Ben: Dislike' })).toBeInTheDocument()
    expect(within(cells[2]!).getByRole('button', { name: 'Ben: Exclusion' })).toBeInTheDocument()
    for (const b of screen.getAllByRole('button')) {
      expect(b.querySelector('svg')).not.toBeNull()
      expect(b.textContent).toBe('')
    }
  })
  it('reports the tapped state for that Member (the hook applies nextState)', async () => {
    const { onToggle } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Ben: Favourite' }))
    expect(onToggle).toHaveBeenLastCalledWith(2, 'favourite')
    await userEvent.click(screen.getByRole('button', { name: 'Anna: Exclusion' }))
    expect(onToggle).toHaveBeenLastCalledWith(1, 'exclusion')
  })
  it('reports a tap on the pressed state too, so tapping it again can clear it', async () => {
    const { onToggle } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Anna: Dislike' }))
    expect(onToggle).toHaveBeenCalledWith(1, 'dislike')
  })
  it('presses one state per row from the rows it is given', () => {
    view({ rows: [row(anna, { state: 'favourite' }), row(ben, { state: 'exclusion' })] })
    expect(within(rowOf('Anna')).getAllByRole('button', { pressed: true })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Anna: Favourite' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Ben: Exclusion' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('PreferenceTable: keyboard', () => {
  it('Tab reaches every button row by row, in column order', async () => {
    view()
    const order: string[] = []
    for (let i = 0; i < 9; i++) {
      await userEvent.tab()
      order.push(document.activeElement?.getAttribute('aria-label') ?? '')
    }
    expect(order).toEqual([
      'Anna: Favourite', 'Anna: Dislike', 'Anna: Exclusion',
      'Ben: Favourite', 'Ben: Dislike', 'Ben: Exclusion',
      'Cara: Favourite', 'Cara: Dislike', 'Cara: Exclusion',
    ])
  })
  it('Enter and Space toggle the focused button', async () => {
    const { onToggle } = view()
    screen.getByRole('button', { name: 'Ben: Dislike' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(onToggle).toHaveBeenLastCalledWith(2, 'dislike')
    await userEvent.keyboard(' ')
    expect(onToggle).toHaveBeenCalledTimes(2)
    expect(onToggle).toHaveBeenLastCalledWith(2, 'dislike')
  })
})

describe('PreferenceTable: an Exclusion via an Ingredient', () => {
  it('is read-only: no Exclusion button, and the cell reads "Excluded via garlic"', () => {
    view({ rows: [row(anna, { you: true }), row(ben, { via: ['garlic'] })] })
    expect(screen.queryByRole('button', { name: 'Ben: Exclusion' })).toBeNull()
    const cell = within(rowOf('Ben')).getAllByRole('cell')[2]!
    expect(cell).toHaveTextContent('Excluded via garlic')
    expect(cell.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Anna: Exclusion' })).toBeInTheDocument()
  })
  it('names every Ingredient: "via garlic, peanut"', () => {
    view({ rows: [row(ben, { via: ['garlic', 'peanut'] })] })
    expect(rowOf('Ben')).toHaveTextContent('via garlic, peanut')
  })
  it('keeps Favourite and Dislike usable in that row', async () => {
    const { onToggle } = view({ rows: [row(ben, { via: ['garlic'], state: 'favourite' })] })
    expect(screen.getByRole('button', { name: 'Ben: Favourite' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Ben: Dislike' }))
    expect(onToggle).toHaveBeenCalledWith(2, 'dislike')
  })
  it('keeps the pressed Exclusion button and adds "also via garlic" when the Member also excludes the Recipe', () => {
    view({ rows: [row(ben, { via: ['garlic'], state: 'exclusion' })] })
    expect(screen.getByRole('button', { name: 'Ben: Exclusion' })).toHaveAttribute('aria-pressed', 'true')
    expect(rowOf('Ben')).toHaveTextContent('also via garlic')
    expect(rowOf('Ben')).not.toHaveTextContent('Excluded via')
  })
  it('explains under the table where such an Exclusion is changed, only when some row has one', () => {
    const note = "An Exclusion via an Ingredient is changed on that Ingredient's line, under Ingredients."
    const { unmount } = view({ rows: [row(ben, { via: ['garlic'] })] })
    expect(screen.getByText(note)).toBeInTheDocument()
    unmount()
    view()
    expect(screen.queryByText(note)).toBeNull()
  })
})

describe('PreferenceTable: no Members and failure', () => {
  it('without Members, says so and offers Add Members to an Admin', () => {
    view({ rows: [], isAdmin: true })
    expect(screen.getByRole('heading', { name: 'No Members yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add Members' })).toHaveAttribute('href', '/settings/members')
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('without Members, tells another User to ask an Admin', () => {
    view({ rows: [], isAdmin: false })
    expect(screen.getByText('Ask an Admin to add Members')).toBeInTheDocument()
    expect(screen.queryByText('Add Members')).toBeNull()
  })
  it('shows an ErrorState with Try again when the load failed', async () => {
    const onRetry = vi.fn()
    view({ rows: [], error: true, onRetry })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('PreferenceTable: no native browser UI', () => {
  it('renders only buttons for the states: no select, input, textarea, label or details', () => {
    const { container } = view()
    expect(container.querySelector('select, input, textarea, label, details, datalist')).toBeNull()
  })
  it('never calls alert, confirm or prompt', async () => {
    const spies = (['alert', 'confirm', 'prompt'] as const).map((k) => vi.spyOn(window, k).mockImplementation(() => { throw new Error('native UI') }))
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Cara: Exclusion' }))
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })
})
