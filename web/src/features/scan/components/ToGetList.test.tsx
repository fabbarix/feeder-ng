// Beta.8 (scan): the To get tab ticks a Line by hand (shop-scan-proposals.md 13.2 as changed in beta.8). The whole row is the
// tick: one real button named "Tick {Line}", no navigation. Its second line reads like a Scanned row's: the pack, then one
// tick (hollow while some is still to get) and "x of y". Render only; the rules are in lib/toGet, the request in useToGetTick.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Icon } from '../../../ui/Icon'
import { makeLine } from '../../shop/testData'
import { toGetRows, type ToGetRow } from '../lib/toGet'
import { ToGetList, type ToGetListProps } from './ToGetList'

const rows = (...lines: ReturnType<typeof makeLine>[]): ToGetRow[] => toGetRows(lines, [], 'USD', 'metric')
const passata = makeLine()
const cheese = makeLine({ ingredientId: 5, name: 'Cheese', quantity: 200, pack: null })

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function setup(over: Partial<ToGetListProps> = {}) {
  const props: ToGetListProps = { rows: rows(passata, cheese), pendingKeys: new Set(), onTick: vi.fn(), ...over }
  const view = render(
    <MemoryRouter initialEntries={['/scan']}>
      <ToGetList {...props} />
      <Where />
    </MemoryRouter>,
  )
  // Lazy: the empty-state test renders no list, so it must not be looked up before the test asks for it.
  return {
    props,
    get list() {
      return screen.getByRole('list', { name: 'To get' })
    },
    ...view,
  }
}
const tickSvg = (weight: 'bold' | 'fill', name: 'successOpen' | 'success') => {
  const { container } = render(<Icon name={name} size={14} weight={weight} />)
  return container.querySelector('svg')!.innerHTML
}

describe('ToGetList: tick by hand', () => {
  it('is the "To get" list, one row per Line, each a real button named "Tick {Line}"', () => {
    const { list } = setup()
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByRole('button', { name: 'Tick Passata' })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'Tick Cheese' })).toBeInTheDocument()
  })

  it('a tap on the row ticks that Line and goes nowhere', async () => {
    const { props, list } = setup()
    await userEvent.click(within(list).getByRole('button', { name: 'Tick Cheese' }))
    expect(props.onTick).toHaveBeenCalledTimes(1)
    expect(props.onTick).toHaveBeenCalledWith(expect.objectContaining({ key: 'line:5', title: 'Cheese', ingredientId: 5 }))
    expect(screen.getByTestId('where')).toHaveTextContent('/scan')
  })

  it('has no link and no dialog or chevron: nothing in a row opens another screen or a sheet', () => {
    const { list } = setup()
    expect(list.querySelector('a')).toBeNull()
    expect(list.querySelector('[aria-haspopup], .list-row__chevron')).toBeNull()
  })

  it('the row keeps its Thumb, its pack line and the quantity column of the Shop screen', () => {
    const { list } = setup()
    const row = within(list).getAllByRole('listitem')[0]!
    expect(row.querySelector('.list-row__leading')).not.toBeNull()
    expect(row).toHaveTextContent('1400 g')
    expect(row).toHaveTextContent('2 × Mutti 700 g')
  })

  it('the second line has exactly one tick, hollow, and "x of y"', () => {
    const { list } = setup()
    const meta = within(list).getAllByRole('listitem')[0]!.querySelector('.list-row__meta')!
    const ticks = meta.querySelectorAll('svg')
    expect(ticks).toHaveLength(1)
    expect(ticks[0]).toHaveClass('scanned-row__tick')
    expect(ticks[0]!.innerHTML).toBe(tickSvg('bold', 'successOpen'))
    expect(meta).toHaveTextContent('0 of 1400 g')
  })

  it('shows what the scans already cover: "700 of 1400 g"', () => {
    const covered: ToGetRow[] = [{ ...rows(passata)[0]!, cover: { text: '700 of 1400 g', done: false } }]
    const { list } = setup({ rows: covered })
    expect(within(list).getByRole('listitem').querySelector('.list-row__meta')).toHaveTextContent('700 of 1400 g')
  })

  it('a row being ticked shows the filled tick, is busy, and cannot be ticked twice', async () => {
    const { props, list } = setup({ pendingKeys: new Set(['line:2']) })
    const busy = within(list).getAllByRole('listitem')[0]!
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy.querySelector('.list-row__meta svg')!.innerHTML).toBe(tickSvg('fill', 'success'))
    // ListRow's `busy`: the target stays in place (focus and tab order kept) but is disabled
    const target = within(busy).getByRole('button', { name: 'Tick Passata' })
    expect(target).toBeDisabled()
    await userEvent.click(target)
    expect(props.onTick).not.toHaveBeenCalled()
    // the other row is untouched
    expect(within(list).getAllByRole('listitem')[1]).not.toHaveAttribute('aria-busy')
  })

  it('with nothing left it says so, not an empty list', () => {
    setup({ rows: [] })
    expect(screen.queryByRole('list', { name: 'To get' })).toBeNull()
    expect(screen.getByText('Nothing left to get')).toBeInTheDocument()
    expect(screen.getByText('Every Line on the Shopping List is ticked.')).toBeInTheDocument()
  })
})

describe('ToGetList: accessibility', () => {
  it('every control is a <button> with a name; the busy state is not conveyed by colour alone', () => {
    const { list } = setup({ pendingKeys: new Set(['line:5']) })
    for (const b of list.querySelectorAll('button')) expect(b.getAttribute('aria-label') || b.textContent?.trim()).toBeTruthy()
    expect(list.querySelector('div[role=button], span[role=button], [onclick]')).toBeNull()
    expect(within(list).getAllByRole('listitem')[1]).toHaveAttribute('aria-busy', 'true')
  })

  it('the row target is a native button, so Enter and Space tick it from the keyboard', async () => {
    const { props, list } = setup()
    within(list).getByRole('button', { name: 'Tick Passata' }).focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(props.onTick).toHaveBeenCalledTimes(2)
  })

  it('the tick glyph is decorative: the cover reads as text next to it', () => {
    const { list } = setup()
    expect(list.querySelector('.list-row__meta svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
