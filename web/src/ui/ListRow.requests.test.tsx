import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from './Chip'
import { IconButton } from './IconButton'
import { ListGroup, ListRow } from './ListRow'
import { declarations, readUiCss } from './test-utils'

const Where = () => <output data-testid="where">{useLocation().pathname}</output>
const inRouter = (row: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/stock']}>
      <ListGroup label="Stock">{row}</ListGroup>
      <Where />
    </MemoryRouter>,
  )
const inList = (row: React.ReactNode) => render(<ListGroup label="Stock">{row}</ListGroup>)

describe('WP3b #1: ListRow href is a router Link inside a Router', () => {
  it('navigates client-side (the location changes without a page load)', async () => {
    inRouter(<ListRow title="Milk" href="/stock/7" />)
    const link = screen.getByRole('link', { name: 'Milk' })
    expect(link).toHaveAttribute('href', '/stock/7')
    expect(link).toHaveClass('list-row__target')
    await userEvent.click(link) // a plain <a> would leave the router location unchanged
    expect(screen.getByTestId('where')).toHaveTextContent('/stock/7')
  })

  it('stays a plain <a href> outside a Router, without throwing', () => {
    inList(<ListRow title="Milk" href="/stock/7" />)
    expect(screen.getByRole('link', { name: 'Milk' })).toHaveAttribute('href', '/stock/7')
  })

  it('keeps aria-current on a selected link row', () => {
    inRouter(<ListRow title="Milk" href="/stock/7" selected />)
    expect(screen.getByRole('link', { name: 'Milk' })).toHaveAttribute('aria-current', 'true')
  })
})

describe('WP3b #2: aria-label override and data-* pass-through', () => {
  it('names the target by aria-label instead of the title, for links and buttons', () => {
    inList(
      <>
        <ListRow title="Milk" aria-label="Open Milk in Stock" href="/stock/7" />
        <ListRow title="Eggs" aria-label="Edit Eggs" onActivate={() => {}} />
      </>,
    )
    expect(screen.getByRole('link', { name: 'Open Milk in Stock' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Eggs' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Milk' })).toBeNull()
  })

  it('the visible title is unchanged by the override', () => {
    inList(<ListRow title="Milk" aria-label="Open Milk in Stock" href="/x" />)
    expect(screen.getByText('Milk')).toBeInTheDocument()
  })

  it('passes data-* attributes to the li, and does not clobber data-height / data-selected', () => {
    inList(<ListRow title="Milk" meta="2 L" selected data-testid="row-milk" data-id="7" />)
    const li = screen.getByTestId('row-milk')
    expect(li.tagName).toBe('LI')
    expect(li).toHaveAttribute('data-id', '7')
    expect(li).toHaveAttribute('data-height', '64')
    expect(li).toHaveAttribute('data-selected', 'true')
  })
})

describe('WP3b #3: metaStatus and metaIcon colour the meta line', () => {
  it('marks the meta with its status and shows the status icon by default', () => {
    inList(<ListRow title="Milk" meta="goes off Thu" metaStatus="spoil" />)
    const meta = screen.getByText('goes off Thu').closest('.list-row__meta')!
    expect(meta).toHaveAttribute('data-status', 'spoil')
    expect(meta.querySelector('svg')).not.toBeNull() // goesOff = HourglassMedium
  })

  it('metaIcon overrides the icon, and works without a status', () => {
    const { container } = inList(<ListRow title="Milk" meta="2 L" metaIcon="weigh" />)
    const meta = screen.getByText('2 L').closest('.list-row__meta')!
    expect(meta).not.toHaveAttribute('data-status')
    expect(meta.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('.list-row__meta svg')).toHaveLength(1)
  })

  it('has no icon when neither prop is given (unchanged)', () => {
    inList(<ListRow title="Milk" meta="2 L" />)
    expect(screen.getByText('2 L').closest('.list-row__meta')!.querySelector('svg')).toBeNull()
  })

  it('the meta icon is decorative: the target name stays the title', () => {
    inList(<ListRow title="Milk" meta="goes off Thu" metaStatus="spoil" href="/x" />)
    expect(screen.getByRole('link', { name: 'Milk' })).toBeInTheDocument()
  })

  it('colours the meta with the status foreground tokens', () => {
    const css = readUiCss('ListRow.css')
    expect(declarations(css, ".list-row__meta[data-status='spoil']")).toMatchObject({ color: 'var(--status-spoil-fg)' })
    expect(declarations(css, ".list-row__meta[data-status='leftover']")).toMatchObject({ color: 'var(--status-leftover-fg)' })
    expect(declarations(css, ".list-row__meta[data-status='danger']")).toMatchObject({ color: 'var(--status-danger-fg)' })
  })
})

describe('WP3b #4: two trailing actions and a children slot', () => {
  it('two IconButtons in trailing are each reachable and do not activate the row', async () => {
    const onRow = vi.fn()
    const onUp = vi.fn()
    const onDown = vi.fn()
    inList(
      <ListRow
        title="Chop the onions"
        onActivate={onRow}
        trailing={
          <>
            <IconButton icon="moveUp" label="Move Chop the onions up" onClick={onUp} />
            <IconButton icon="moveDown" label="Move Chop the onions down" onClick={onDown} />
          </>
        }
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Move Chop the onions up' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move Chop the onions down' }))
    expect(onUp).toHaveBeenCalledTimes(1)
    expect(onDown).toHaveBeenCalledTimes(1)
    expect(onRow).not.toHaveBeenCalled()
  })

  it('the trailing group lays its actions in a row with a gap, above the stretched target', () => {
    const css = readUiCss('ListRow.css')
    expect(declarations(css, '.list-row__trailing')).toMatchObject({ display: 'flex', 'align-items': 'center' })
    expect(declarations(css, '.list-row__trailing').gap).toBeTruthy()
  })

  it('renders children (a chip row) under the title/meta inside the text column, and the row is auto-height', () => {
    inList(
      <ListRow title="Chicken tray bake" meta="45 min" data-testid="r">
        <Chip kind="why">uses Monday&apos;s chicken</Chip>
      </ListRow>,
    )
    const li = screen.getByTestId('r')
    expect(li).toHaveAttribute('data-height', 'auto')
    const text = li.querySelector('.list-row__text')!
    expect(within(text as HTMLElement).getByText("uses Monday's chicken")).toBeInTheDocument()
    expect(li.querySelector('.list-row__extra')).not.toBeNull()
    expect(declarations(readUiCss('ListRow.css'), '.list-row__extra')).toMatchObject({ display: 'flex', 'flex-wrap': 'wrap' })
  })

  it('without children nothing is added (the existing heights hold)', () => {
    const { container } = inList(<ListRow title="Milk" />)
    expect(container.querySelector('.list-row__extra')).toBeNull()
    expect(screen.getByRole('listitem')).toHaveAttribute('data-height', '56')
  })
})
