// B9-13, SSP-03: a grouped list shows each group's name in a ListGroup title; a group is never named only for assistive technology.
// Markup (mock ssp-03-pantry-headings.html):
//   <section class="list-group-section"><div class="list-group__header"><h2 class="list-group__title" id=…>
//     <span class="list-group__icon">…</span><span class="list-group__name">Kitchen Fridge</span>
//     <span class="list-group__count">5<span class="visually-hidden"> Stock Lots</span></span></h2>
//     <div class="list-group__action">…</div></div>
//   <div class="list-group"><ul class="list-group__list" aria-labelledby=…>…</ul></div></section>
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ListGroup, ListRow } from './ListRow'

const lots = (n: number) => Array.from({ length: n }, (_, i) => <ListRow key={i} title={`Lot ${i + 1}`} />)
const stockLots = (n: number) => `${n} Stock ${n === 1 ? 'Lot' : 'Lots'}`

describe('ListGroup with a title', () => {
  it('renders a section with an h2 heading naming the list through aria-labelledby (no aria-label)', () => {
    const { container } = render(
      <ListGroup title="Kitchen Fridge" count={5} countLabel={stockLots}>
        {lots(5)}
      </ListGroup>,
    )
    const section = container.querySelector('section.list-group-section')!
    expect(section).not.toBeNull()
    const h = within(section as HTMLElement).getByRole('heading', { level: 2 })
    expect(h).toHaveClass('list-group__title')
    const list = screen.getByRole('list')
    expect(list).not.toHaveAttribute('aria-label')
    expect(list).toHaveAttribute('aria-labelledby', h.id)
    expect(h.id).not.toBe('')
    expect(list).toHaveAccessibleName(/^Kitchen Fridge,?\s+5 Stock Lots$/)
  })
  it('the heading shows the name and the bare count; the count is spelled out in visually hidden text', () => {
    const { container } = render(
      <ListGroup title="Kitchen Fridge" count={5} countLabel={stockLots}>
        {lots(5)}
      </ListGroup>,
    )
    expect(container.querySelector('.list-group__name')).toHaveTextContent('Kitchen Fridge')
    const count = container.querySelector('.list-group__count')!
    expect(count.firstChild!.textContent).toBe('5')
    expect(count.querySelector('.visually-hidden')).toHaveTextContent('5 Stock Lots')
  })
  it('without a countLabel there is no hidden text; without a count there is no chip', () => {
    const a = render(<ListGroup title="Garage Freezer" count={2}>{lots(2)}</ListGroup>)
    expect(a.container.querySelector('.list-group__count')).toHaveTextContent('2')
    expect(a.container.querySelector('.list-group__count .visually-hidden')).toBeNull()
    a.unmount()
    const b = render(<ListGroup title="Garage Freezer">{lots(2)}</ListGroup>)
    expect(b.container.querySelector('.list-group__count')).toBeNull()
  })
  it('a count of 0 still shows its chip ("0")', () => {
    const { container } = render(<ListGroup title="Not sorted" count={0} countLabel={stockLots}>{null}</ListGroup>)
    expect(container.querySelector('.list-group__count')!.firstChild!.textContent).toBe('0')
  })
  it('the icon is decorative and comes before the name', () => {
    const { container } = render(<ListGroup title="Garage Freezer" icon="snowflake">{lots(1)}</ListGroup>)
    const icon = container.querySelector('.list-group__icon')!
    expect(icon.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(icon.compareDocumentPosition(container.querySelector('.list-group__name')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('list')).toHaveAccessibleName('Garage Freezer')
  })
  it('without an icon there is no icon slot', () => {
    const { container } = render(<ListGroup title="Pantry">{lots(1)}</ListGroup>)
    expect(container.querySelector('.list-group__icon')).toBeNull()
  })
  it('the action slot is in the heading row, after the heading, outside the h2, and works as a control', () => {
    const { container } = render(
      <ListGroup title="Not sorted" count={3} action={<button type="button">Put away</button>}>
        {lots(3)}
      </ListGroup>,
    )
    const header = container.querySelector('.list-group__header')!
    const action = within(header as HTMLElement).getByRole('button', { name: 'Put away' })
    expect(action.closest('.list-group__action')).not.toBeNull()
    expect(container.querySelector('.list-group__title')!.contains(action)).toBe(false)
    expect(screen.getByRole('heading', { level: 2 })).not.toHaveTextContent('Put away')
    expect(screen.getByRole('list')).not.toHaveAccessibleName(/Put away/)
  })
  it('the card is still a .list-group holding the .list-group__list, inside the section', () => {
    const { container } = render(<ListGroup title="Pantry">{lots(2)}</ListGroup>)
    const card = container.querySelector('section.list-group-section > .list-group')!
    expect(card.querySelector('ul.list-group__list')).not.toBeNull()
    expect(card).toHaveAttribute('data-primary-scope')
  })
  it('a long name is one heading element (it wraps in CSS), never truncated in the DOM', () => {
    const name = 'Basement pantry shelves behind the boiler, bottom left shelf, the one with the blue crates'
    const { container } = render(<ListGroup title={name}>{lots(1)}</ListGroup>)
    expect(container.querySelector('.list-group__name')!.textContent).toBe(name)
  })
  it('two groups on one page get two different heading ids', () => {
    render(
      <>
        <ListGroup title="Kitchen Fridge">{lots(1)}</ListGroup>
        <ListGroup title="Garage Freezer">{lots(1)}</ListGroup>
      </>,
    )
    const [a, b] = screen.getAllByRole('heading', { level: 2 })
    expect(a!.id).not.toBe(b!.id)
    const [l1, l2] = screen.getAllByRole('list')
    expect(l1).toHaveAccessibleName('Kitchen Fridge')
    expect(l2).toHaveAccessibleName('Garage Freezer')
  })
})

describe('ListGroup with only a label (every other user)', () => {
  it('keeps the plain card: aria-label on the list, no section, no heading', () => {
    const { container } = render(<ListGroup label="To get">{lots(2)}</ListGroup>)
    expect(screen.getByRole('list', { name: 'To get' })).toBeInTheDocument()
    expect(container.querySelector('section')).toBeNull()
    expect(screen.queryByRole('heading')).toBeNull()
    expect(container.firstElementChild).toHaveClass('list-group')
  })
  it('title wins over label when both are given (no double name)', () => {
    render(<ListGroup label="hidden" title="Visible">{lots(1)}</ListGroup>)
    const list = screen.getByRole('list')
    expect(list).toHaveAccessibleName('Visible')
    expect(list).not.toHaveAttribute('aria-label')
  })
})
