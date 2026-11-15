// B9-47 (TB-07, TB-08, decision TB 7): the board's hero tile. Its eyebrow is Today's parts with the day word, one line of parts that never
// break inside (TB-15b); "Tonight" is gone; the slot's Courses, the start line and ONE big Cook button follow. Also what the tile said
// before (CRS F: Courses as rows, the main one larger; B5-F1: Not served), under the new words. The tile is a region named by its eyebrow.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { course, heroOf, meal, slotOn, TODAY } from '../test-utils'
import type { SlotLike } from '../types'
import { BoardHeroTile } from './BoardTiles'

const dinner = (courses?: Parameters<typeof slotOn>[4]) => slotOn(TODAY, 3, 'Dinner', '19:00', courses ?? 'Chicken stew')
const several = () => dinner([course(1, 'Main', true, { meal: meal('Roast chicken') }), course(2, 'Side', false, { meal: meal('Green beans') }), course(3, 'Dessert', false, { unserved: 'optional' })])

describe('the hero\'s eyebrow (TB 7, TB-08)', () => {
  it('is a region named by its eyebrow; it never says Tonight', () => {
    render(<BoardHeroTile hero={heroOf(dinner(), { eyebrow: ['Today', 'Dinner', '19:00'] })} />)
    const region = screen.getByRole('region', { name: /^Today\s*·\s*Dinner\s*·\s*19:00$/ })
    expect(region).toBeInTheDocument()
    expect(screen.queryByText(/tonight/i)).not.toBeInTheDocument()
  })
  it('each part is a span of the eyebrow; every part after the first starts with its "·" (a line never ends in a separator)', () => {
    const { container } = render(<BoardHeroTile hero={heroOf(dinner(), { eyebrow: ['Today', 'Dinner', 'start 13:00'] })} />)
    const parts = [...container.querySelectorAll('.board-eyebrow > .board-eyebrow__part')].map((p) => p.textContent)
    expect(parts).toEqual(['Today', '· Dinner', '· start 13:00'])
  })
  it('the start part is marked, and "start now" says so (data-now)', () => {
    const { container, rerender } = render(<BoardHeroTile hero={heroOf(dinner(), { eyebrow: ['Today', 'Dinner', 'start 13:00'] })} />)
    expect(container.querySelector('.board-eyebrow__start')).not.toHaveAttribute('data-now')
    rerender(<BoardHeroTile hero={heroOf(dinner(), { eyebrow: ['Today', 'Dinner', 'start now'] })} />)
    expect(container.querySelector('.board-eyebrow__start')).toHaveAttribute('data-now', 'true')
  })
  it('tomorrow\'s eyebrow keeps its day word, with no time', () => {
    const { container } = render(<BoardHeroTile hero={heroOf(dinner(), { day: 'tomorrow', eyebrow: ['Tomorrow', 'Breakfast'] })} />)
    expect([...container.querySelectorAll('.board-eyebrow__part')].map((p) => p.textContent)).toEqual(['Tomorrow', '· Breakfast'])
  })
})

describe('the hero\'s body', () => {
  it('shows the Recipe name of a one-Course slot', () => {
    render(<BoardHeroTile hero={heroOf(dinner())} />)
    expect(screen.getByText('Chicken stew')).toBeInTheDocument()
  })
  it('the line under the Courses: "Start 13:00 · ready 19:00" when the hero has one, and only then', () => {
    const { rerender } = render(<BoardHeroTile hero={heroOf(dinner(), { startLine: 'Start 13:00 · ready 19:00' })} />)
    expect(screen.getByText('Start 13:00 · ready 19:00')).toBeInTheDocument()
    rerender(<BoardHeroTile hero={heroOf(dinner(), { startLine: null })} />)
    expect(screen.queryByText(/ready/)).not.toBeInTheDocument()
  })
  it('lists a row per Course with a Planned Meal in the slot order, in a list named "Courses" (no empty optional Course)', () => {
    render(<BoardHeroTile hero={heroOf(several())} />)
    const list = screen.getByRole('list', { name: 'Courses' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((li) => li.textContent)).toEqual(['Roast chicken', 'Green beans'])
    expect(within(list).queryByText(/Dessert/)).not.toBeInTheDocument()
  })
  it('the main Course\'s row is the larger one (data-main) and a Cooked row is marked data-state', () => {
    const cooked = dinner([course(1, 'Main', true, { meal: meal('Roast chicken', 'cooked') }), course(2, 'Side', false, { meal: meal('Green beans') })])
    render(<BoardHeroTile hero={heroOf(cooked)} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveAttribute('data-main', 'true')
    expect(rows[0]).toHaveAttribute('data-state', 'cooked')
    expect(rows[1]).not.toHaveAttribute('data-main')
    expect(rows[1]).toHaveAttribute('data-state', 'planned')
  })
  it('has no chips (relaxed picks included)', () => {
    const relaxed = dinner([course(1, 'Main', true, { meal: { ...meal('Roast chicken'), relaxed: true } })])
    const { container } = render(<BoardHeroTile hero={heroOf(relaxed)} />)
    expect(container.querySelector('.chip')).toBeNull()
  })
  it('is the hero tile, 2 x 2', () => {
    const { container } = render(<BoardHeroTile hero={heroOf(dinner())} />)
    expect(container.firstElementChild).toHaveAttribute('data-variant', 'hero')
    expect(container.firstElementChild).toHaveAttribute('data-span', '2')
    expect(container.firstElementChild).toHaveAttribute('data-row-span', '2')
  })
})

describe('Cook (5.13): ONE big button that starts Cook Mode', () => {
  // B9-47 ruling 5 (P38, every button on a page has its own name): Cook's name says the slot, "Cook Dinner"; its visible label stays "Cook".
  it('calls onCook once', async () => {
    const onCook = vi.fn()
    render(<BoardHeroTile hero={heroOf(several())} onCook={onCook} />)
    expect(screen.getAllByRole('button', { name: /^Cook/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Cook Dinner' })).toHaveTextContent(/^Cook$/)
    await userEvent.click(screen.getByRole('button', { name: 'Cook Dinner' }))
    expect(onCook).toHaveBeenCalledTimes(1)
  })
  it('there is none without a handler or without a hero', () => {
    const { rerender } = render(<BoardHeroTile hero={heroOf(dinner())} />)
    expect(screen.queryByRole('button', { name: /^Cook/ })).not.toBeInTheDocument()
    rerender(<BoardHeroTile hero={null} onCook={() => {}} />)
    expect(screen.queryByRole('button', { name: /^Cook/ })).not.toBeInTheDocument()
  })
})

describe('with no hero (B5-F1, ADR 0014)', () => {
  const notServed = (over: Partial<SlotLike> = {}): SlotLike => slotOn(TODAY, 2, 'Dinner', '19:30', [course(1, 'Main', true, { unserved: 'not_served' })], { notServed: true, ...over })
  it('says "Dinner · Not served" for a slot Not served today, with no Cook', () => {
    render(<BoardHeroTile hero={null} notServed={[notServed()]} onCook={() => {}} />)
    expect(screen.getByText('Dinner · Not served')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cook/ })).not.toBeInTheDocument()
  })
  it('says nothing is planned (and not "tonight") when nothing is Not served either', () => {
    render(<BoardHeroTile hero={null} notServed={[]} />)
    expect(screen.getByText(/^Nothing planned/)).toBeInTheDocument()
    expect(screen.queryByText(/tonight/i)).not.toBeInTheDocument()
  })
})
