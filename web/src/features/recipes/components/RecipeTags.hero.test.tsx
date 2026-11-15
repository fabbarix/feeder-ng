// RX-04: the hero's chip line. Archived, Courses, Whole meal, Ready Meal and Tags share ONE line (a list named "Courses and Tags"), fitted so the
// outlined "+N" chip is never cut. "+N" is a button that expands the line in place (aria-expanded, named "Show all 8 Tags").
// The lead chips (Archived, Courses, Whole meal, Ready Meal) never collapse; only Tags go into "+N".
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ visible: null as number | null }))
vi.mock('../../../ui/lib/useFittingChips', async (orig) => ({
  ...(await orig<typeof import('../../../ui/lib/useFittingChips')>()),
  useFittingChips: (_line: unknown, count: number) => (h.visible === null ? { visible: count, hidden: 0 } : { visible: Math.min(h.visible, count), hidden: Math.max(0, count - h.visible) }),
}))

import { RecipeTags } from './RecipeTags'

const TAGS = ['quick', 'family', 'roast', 'sweet', 'winter', 'light', 'spicy', 'party']
const line = () => screen.getByRole('list', { name: 'Courses and Tags' })
const labels = () => within(line()).getAllByRole('listitem').map((li) => li.textContent)

beforeEach(() => {
  h.visible = null
})

describe('RecipeTags: the hero line (lead chips)', () => {
  it('is named "Courses and Tags" and lists the lead chips first, then the Tags, in one list', () => {
    render(<RecipeTags tags={['quick', 'family']} lead={['Archived', 'Main', 'Whole meal', 'Ready Meal']} fitted />)
    expect(labels()).toEqual(['Archived', 'Main', 'Whole meal', 'Ready Meal', 'quick', 'family'])
    expect(screen.queryByRole('list', { name: 'Tags' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Courses' })).toBeNull()
  })
  it('lead chips are plain tag chips, not buttons; Tags are buttons when onOpen is given', () => {
    render(<RecipeTags tags={['quick']} lead={['Main']} onOpen={vi.fn()} fitted />)
    expect(within(line()).getAllByRole('button').map((b) => b.textContent)).toEqual(['quick'])
  })
  it('shows a line of lead chips alone when there are no Tags', () => {
    render(<RecipeTags tags={[]} lead={['Main']} fitted />)
    expect(labels()).toEqual(['Main'])
  })
  it('renders nothing with no lead chips and no Tags', () => {
    const { container } = render(<RecipeTags tags={[]} lead={[]} fitted />)
    expect(container).toBeEmptyDOMElement()
  })
  it('is marked fitted for its CSS: one line, 5 px of ring room', () => {
    render(<RecipeTags tags={['quick']} lead={['Main']} fitted />)
    expect(line()).toHaveAttribute('data-fitted', 'true')
  })
})

describe('RecipeTags: "+N" of a fitted line', () => {
  it('shows the Tags that fit, then an outlined "+N" button named "Show all 8 Tags", closed', () => {
    h.visible = 2
    render(<RecipeTags tags={TAGS} lead={['Main']} fitted />)
    expect(labels()).toEqual(['Main', 'quick', 'family', '+6'])
    const more = screen.getByRole('button', { name: 'Show all 8 Tags' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(more).toHaveTextContent('+6')
    expect(more).toHaveClass('recipe-tags__more')
  })
  it('has no "+N" when every Tag fits', () => {
    h.visible = null
    render(<RecipeTags tags={TAGS} lead={['Main']} fitted />)
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull()
    expect(labels()).toHaveLength(9)
  })
  it('opens the whole line in place: every Tag shows and the button says it is expanded', async () => {
    h.visible = 2
    render(<RecipeTags tags={TAGS} lead={['Main']} fitted />)
    await userEvent.click(screen.getByRole('button', { name: 'Show all 8 Tags' }))
    expect(labels().slice(0, 9)).toEqual(['Main', ...TAGS])
    const less = screen.getByRole('button', { name: 'Show fewer Tags' })
    expect(less).toHaveAttribute('aria-expanded', 'true')
  })
  it('closes again from the same button, which keeps keyboard focus', async () => {
    h.visible = 2
    render(<RecipeTags tags={TAGS} lead={['Main']} fitted />)
    await userEvent.click(screen.getByRole('button', { name: 'Show all 8 Tags' }))
    const less = screen.getByRole('button', { name: 'Show fewer Tags' })
    less.focus()
    await userEvent.click(less)
    expect(screen.getByRole('button', { name: 'Show all 8 Tags' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Show all 8 Tags' })).toHaveFocus()
  })
  it('the lead chips never go into "+N", however narrow the line', () => {
    h.visible = 0
    render(<RecipeTags tags={TAGS} lead={['Archived', 'Main', 'Ready Meal']} fitted />)
    expect(labels().slice(0, 3)).toEqual(['Archived', 'Main', 'Ready Meal'])
    expect(screen.getByRole('button', { name: 'Show all 8 Tags' })).toBeInTheDocument()
  })
  it('without `fitted` the line is the plain Tags list with its static "+N" image (the tile\'s behaviour, unchanged)', () => {
    render(<RecipeTags tags={['a', 'b', 'c', 'd', 'e']} limit={2} />)
    expect(screen.getByRole('img', { name: '3 more Tags' })).toHaveTextContent('+3')
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull()
  })
})
