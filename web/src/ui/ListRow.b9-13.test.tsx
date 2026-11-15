// B9-13: the slots the screen packages build on. Each describe names its chapter item.
//   A11Y-08 row names, DS-10 metaLines, SSP-05 metaCompact, SET-03 actions, PC-06 below, RES-03 sync, DS-01 target.
// The CSS side is in ListRow.b9-13.css.test.ts. A row's DOM order is: control, target, picture, text, value, trailing, chevron,
// actions, below, footer, panel.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ListGroup, ListRow } from './ListRow'

const inList = (row: React.ReactNode) => render(<ListGroup label="Test">{row}</ListGroup>)
const li = (c: HTMLElement) => c.querySelector('li.list-row') as HTMLElement
const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('A11Y-08: the row target is named by the title and described by the value, sub-value and meta', () => {
  it('the name stays the title; the description reads the value before the meta ("Flour, button, 500 g · Good until tomorrow")', () => {
    inList(<ListRow title="Flour" meta="Good until tomorrow" value="500 g" onActivate={() => {}} />)
    const target = screen.getByRole('button', { name: 'Flour' })
    expect(target).toHaveAccessibleName('Flour')
    expect(target).toHaveAccessibleDescription(/^500 g\s+Good until tomorrow$/)
  })
  it('a sub-value (a price) is part of the description, after the value and before the meta', () => {
    inList(<ListRow title="Chicken breast" meta="3 packs" value="1400 g" subValue="€ 14.37" onActivate={() => {}} />)
    expect(screen.getByRole('button', { name: 'Chicken breast' })).toHaveAccessibleDescription(/^1400 g\s+€ 14\.37\s+3 packs$/)
  })
  it('a row with only a meta is described by it; a row with nothing to describe has no aria-describedby', () => {
    inList(
      <>
        <ListRow title="A" meta="only meta" onActivate={() => {}} />
        <ListRow title="B" onActivate={() => {}} />
      </>,
    )
    expect(screen.getByRole('button', { name: 'A' })).toHaveAccessibleDescription('only meta')
    expect(screen.getByRole('button', { name: 'B' })).not.toHaveAttribute('aria-describedby')
  })
  it('every id resolves to an element of the row, and ids are unique across rows (two Flour Stock Lots read differently)', () => {
    inList(
      <>
        <ListRow title="Flour" meta="Good until Sat" value="500 g" onActivate={() => {}} />
        <ListRow title="Flour" meta="Went off 14 days ago" value="1 kg" onActivate={() => {}} />
      </>,
    )
    const [a, b] = screen.getAllByRole('button', { name: 'Flour' })
    expect(a).toHaveAccessibleDescription(/500 g\s+Good until Sat/)
    expect(b).toHaveAccessibleDescription(/1 kg\s+Went off 14 days ago/)
    const ids = [...a!.getAttribute('aria-describedby')!.split(' '), ...b!.getAttribute('aria-describedby')!.split(' ')]
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(document.getElementById(id), id).not.toBeNull()
  })
  it('the ids sit on the meta, value and sub-value elements the row already renders', () => {
    const { container } = inList(<ListRow title="X" meta="m" value="v" subValue="s" onActivate={() => {}} />)
    const ids = screen.getByRole('button', { name: 'X' }).getAttribute('aria-describedby')!.split(' ')
    const targets = ids.map((id) => document.getElementById(id)!)
    expect(targets.map((t) => t.className.split(' ').find((c) => c.startsWith('list-row__')))).toEqual(['list-row__value', 'list-row__sub-value', 'list-row__meta'])
    for (const t of targets) expect(li(container).contains(t)).toBe(true)
  })
  it('an aria-describedby from the caller is kept, first', () => {
    render(
      <>
        <p id="hint">Hold to select</p>
        <ListGroup label="Test">
          <ListRow title="Flour" meta="Good until Sat" aria-describedby="hint" onActivate={() => {}} />
        </ListGroup>
      </>,
    )
    const d = screen.getByRole('button', { name: 'Flour' })
    expect(d.getAttribute('aria-describedby')!.split(' ')[0]).toBe('hint')
    expect(d).toHaveAccessibleDescription(/^Hold to select\s+Good until Sat$/)
  })
  it('a link row and a disclosure row are described the same way', () => {
    render(
      <MemoryRouter>
        <ListGroup label="Test">
          <ListRow title="Allowlist" meta="Who can sign in" href="/settings/allowlist" chevron />
          <ListRow title="More" meta="Details" onToggle={() => {}} expanded={false} />
        </ListGroup>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Allowlist' })).toHaveAccessibleDescription('Who can sign in')
    expect(screen.getByRole('button', { name: 'More' })).toHaveAccessibleDescription('Details')
  })
  it('a row with an explicit aria-label keeps that name and still has its description', () => {
    inList(<ListRow title={<em>Flour</em>} aria-label="Flour, Kitchen Pantry" meta="Good until Sat" onActivate={() => {}} />)
    const t = screen.getByRole('button', { name: 'Flour, Kitchen Pantry' })
    expect(t).toHaveAccessibleDescription('Good until Sat')
  })
  it('the compact form never reaches the description: it is the long text', () => {
    inList(<ListRow title="Washing-up liquid" meta="Below 1 l · 400 ml in Stock" metaCompact="400 ml in Stock" value="400 ml" onActivate={() => {}} />)
    expect(screen.getByRole('button', { name: 'Washing-up liquid' })).toHaveAccessibleDescription(/^400 ml\s+Below 1 l · 400 ml in Stock$/)
  })
})

describe('DS-10: metaLines={2} on a navigation row', () => {
  it('writes data-meta-lines="2" on a link row (an href and a chevron)', () => {
    const { container } = render(
      <MemoryRouter>
        <ListGroup label="Settings">
          <ListRow title="Supplies" meta="What you buy and keep but don't cook with: toilet paper, batteries, laundry pods" href="/supplies" chevron metaLines={2} />
        </ListGroup>
      </MemoryRouter>,
    )
    expect(li(container)).toHaveAttribute('data-meta-lines', '2')
  })
  it('is one line by default and for metaLines={1}: no attribute, or "1"', () => {
    const { container } = render(
      <MemoryRouter>
        <ListGroup label="S">
          <ListRow title="A" meta="m" href="/a" chevron />
          <ListRow title="B" meta="m" href="/b" chevron metaLines={1} />
        </ListGroup>
      </MemoryRouter>,
    )
    const [a, b] = [...container.querySelectorAll('li')]
    expect(a!.getAttribute('data-meta-lines') ?? '1').toBe('1')
    expect(b!.getAttribute('data-meta-lines') ?? '1').toBe('1')
  })
  it('is refused on a row without an href: the attribute is not written (a status row keeps one line)', () => {
    const { container } = inList(<ListRow title="Flour" meta="Good until Sat" onActivate={() => {}} metaLines={2} />)
    expect(li(container)).not.toHaveAttribute('data-meta-lines', '2')
    const s = inList(<ListRow title="Static" meta="m" metaLines={2} />)
    expect(li(s.container)).not.toHaveAttribute('data-meta-lines', '2')
  })
  // Batch w3e (B9-34 P23 on /scan): a chevron row that opens a page is a navigation row too ("Read the receipt").
  it('is allowed on an onActivate row with a chevron (it opens a page)', () => {
    const { container } = inList(<ListRow title="Read the receipt" meta="Fill in Prices and weighed amounts from a photo" chevron onActivate={() => {}} metaLines={2} />)
    expect(li(container)).toHaveAttribute('data-meta-lines', '2')
  })
  it('the full description is still the link row accessible description', () => {
    render(
      <MemoryRouter>
        <ListGroup label="Settings">
          <ListRow title="Supplies" meta="A long description that may be cut at the second line" href="/supplies" chevron metaLines={2} />
        </ListGroup>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Supplies' })).toHaveAccessibleDescription('A long description that may be cut at the second line')
  })
})

describe('SSP-05: metaCompact', () => {
  it('renders the long text in .list-row__meta-text and the short one in an aria-hidden .list-row__meta-compact sibling', () => {
    const { container } = inList(<ListRow title="Kitchen roll" meta="Below 4 · 2 in Stock" metaCompact="2 in Stock" metaStatus="info" value="2 pieces" />)
    const meta = container.querySelector('.list-row__meta')!
    const long = meta.querySelector('.list-row__meta-text')!
    const compact = meta.querySelector('.list-row__meta-compact')!
    expect(long).toHaveTextContent('Below 4 · 2 in Stock')
    expect(compact).toHaveTextContent('2 in Stock')
    expect(compact).toHaveAttribute('aria-hidden', 'true')
    expect(long).not.toHaveAttribute('aria-hidden')
    expect(after(long, compact)).toBe(true)
    expect(meta).toHaveAttribute('data-status', 'info')
  })
  it('without metaCompact there is no compact element and the meta text is the meta alone', () => {
    const { container } = inList(<ListRow title="Kitchen roll" meta="Below 4 · 2 in Stock" />)
    expect(container.querySelector('.list-row__meta-compact')).toBeNull()
    expect(container.querySelector('.list-row__meta-text')!.textContent).toBe('Below 4 · 2 in Stock')
  })
  it('an empty compact form ("") renders none', () => {
    const { container } = inList(<ListRow title="Dishwasher tablets" meta="Restocks below 20" metaCompact="" />)
    expect(container.querySelector('.list-row__meta-compact')).toBeNull()
  })
  it('a ReactNode meta is always wrapped in .list-row__meta-text, so the ellipsis can reach it (Supplies at 375, Scan To get)', () => {
    const { container } = inList(
      <ListRow
        title="Rice"
        meta={
          <>
            <b>400 ml</b> · below Restock level 1 l
          </>
        }
      />,
    )
    const text = container.querySelector('.list-row__meta > .list-row__meta-text')!
    expect(text).toHaveTextContent('400 ml · below Restock level 1 l')
    expect(text.querySelector('b')).not.toBeNull()
  })
})

describe('SET-03: the actions slot', () => {
  it('renders after the text, value, trailing and chevron, in .list-row__actions, and marks the row data-actions', () => {
    const { container } = inList(
      <ListRow
        title="chiara@example.com"
        meta="You · Admin · Last Admin"
        value="v"
        trailing={<span data-testid="tr" />}
        chevron
        actions={
          <>
            <button type="button">Admin</button>
            <button type="button">Remove</button>
          </>
        }
      />,
    )
    const row = li(container)
    const actions = row.querySelector('.list-row__actions')!
    expect(row).toHaveAttribute('data-actions', 'true')
    for (const sel of ['.list-row__text', '.list-row__value', '.list-row__trailing', '.list-row__chevron']) expect(after(row.querySelector(sel)!, actions), sel).toBe(true)
    expect(within(actions as HTMLElement).getAllByRole('button').map((b) => b.textContent)).toEqual(['Admin', 'Remove'])
  })
  it('the actions are their own controls: the row target is separate and the actions are not inside the text column', () => {
    const onActivate = vi.fn()
    const onRemove = vi.fn()
    const { container } = inList(<ListRow title="Sam" onActivate={onActivate} actions={<button type="button" onClick={onRemove}>Remove</button>} />)
    expect(container.querySelector('.list-row__text')!.contains(container.querySelector('.list-row__actions'))).toBe(false)
  })
  it('a click on an action does not activate the row', async () => {
    const onActivate = vi.fn()
    const onRemove = vi.fn()
    inList(<ListRow title="Sam" onActivate={onActivate} actions={<button type="button" onClick={onRemove}>Remove</button>} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledOnce()
    expect(onActivate).not.toHaveBeenCalled()
  })
  it('without actions there is no slot and no attribute', () => {
    const { container } = inList(<ListRow title="Sam" />)
    expect(container.querySelector('.list-row__actions')).toBeNull()
    expect(li(container)).not.toHaveAttribute('data-actions')
  })
})

describe('PC-06: the below slot', () => {
  it('renders .list-row__below after the trailing slot (and the actions), marks the row data-has-below', () => {
    const { container } = inList(
      <ListRow title="Pasta al pomodoro" trailing={<button type="button">Swap</button>} actions={<button type="button">A</button>} below={<span data-testid="chips">chips</span>} />,
    )
    const row = li(container)
    const below = row.querySelector('.list-row__below')!
    expect(row).toHaveAttribute('data-has-below')
    expect(below).toContainElement(screen.getByTestId('chips'))
    expect(after(row.querySelector('.list-row__trailing')!, below)).toBe(true)
    expect(after(row.querySelector('.list-row__actions')!, below)).toBe(true)
    expect(row.querySelector('.list-row__text')!.contains(below)).toBe(false)
  })
  it('a row with no chips renders no line: null, undefined, false and an empty fragment', () => {
    for (const below of [null, undefined, false, ''] as const) {
      const { container, unmount } = inList(<ListRow title="Frozen lasagne" below={below as never} />)
      expect(container.querySelector('.list-row__below')).toBeNull()
      expect(li(container)).not.toHaveAttribute('data-has-below')
      unmount()
    }
  })
  it('children stay in the text column (callers opt in to below, nothing moves for them)', () => {
    const { container } = inList(<ListRow title="X">{<span data-testid="extra" />}</ListRow>)
    expect(container.querySelector('.list-row__text')).toContainElement(screen.getByTestId('extra'))
    expect(container.querySelector('.list-row__below')).toBeNull()
  })
  it('a control in below stays clickable and does not activate the row', async () => {
    const onActivate = vi.fn()
    const onMore = vi.fn()
    inList(<ListRow title="Pasta" onActivate={onActivate} below={<button type="button" onClick={onMore}>+2</button>} />)
    await userEvent.click(screen.getByRole('button', { name: '+2' }))
    expect(onMore).toHaveBeenCalledOnce()
    expect(onActivate).not.toHaveBeenCalled()
  })
})

describe('RES-03: the sync prop', () => {
  it('pending: data-sync="pending", the meta is muted (no tone) with the Clock icon', () => {
    const { container } = inList(<ListRow title="Carrot" meta="Waiting to sync · 50 g to Stock" sync="pending" value="50 g" />)
    expect(li(container)).toHaveAttribute('data-sync', 'pending')
    const meta = container.querySelector('.list-row__meta')!
    expect(meta).toHaveAttribute('data-tone', 'pending')
    expect(meta).not.toHaveAttribute('data-status')
    expect(meta.querySelector('svg')).not.toBeNull()
    expect(meta).toHaveTextContent('Waiting to sync · 50 g to Stock')
  })
  it('pending with a leading control: a 14 px clock badge sits on the control, decorative', () => {
    const { container } = inList(<ListRow title="Carrot" meta="Waiting to sync" sync="pending" control={<button type="button" aria-label="Tick Carrot" />} />)
    const badge = container.querySelector('.list-row__control .list-row__sync-badge')!
    expect(badge).not.toBeNull()
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(badge.querySelector('svg')).not.toBeNull()
  })
  it('pending without a control draws no badge', () => {
    const { container } = inList(<ListRow title="Rice" meta="500 g · Waiting to sync" sync="pending" />)
    expect(container.querySelector('.list-row__sync-badge')).toBeNull()
  })
  it('failed: data-sync="failed", the meta takes the danger status and the WarningCircle icon, and no clock badge', () => {
    const { container } = inList(<ListRow title="Carrot" meta="Tick not synced" sync="failed" control={<button type="button" aria-label="Tick Carrot" />} />)
    expect(li(container)).toHaveAttribute('data-sync', 'failed')
    const meta = container.querySelector('.list-row__meta')!
    expect(meta).toHaveAttribute('data-status', 'danger')
    expect(meta.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('.list-row__sync-badge')).toBeNull()
  })
  it('an explicit metaIcon wins over the sync icon; no sync means no data-sync, badge or tone', () => {
    const { container } = inList(<ListRow title="X" meta="m" sync="pending" metaIcon="warning" />)
    expect(container.querySelector('.list-row__meta svg')).not.toBeNull()
    const plain = inList(<ListRow title="Y" meta="m" />)
    expect(li(plain.container)).not.toHaveAttribute('data-sync')
    expect(plain.container.querySelector('.list-row__meta')).not.toHaveAttribute('data-tone')
  })
  it('the sync state changes nothing in the name: the row is still named by its title and described by its meta', () => {
    inList(<ListRow title="Carrot" meta="Tick not synced" sync="failed" onActivate={() => {}} />)
    const t = screen.getByRole('button', { name: 'Carrot' })
    expect(t).toHaveAccessibleDescription('Tick not synced')
  })
})

describe('DS-01: the row target keeps its box', () => {
  it('a Menu-like button inside the trailing slot is not the row target (one .list-row__target per row)', () => {
    const { container } = inList(<ListRow title="Chilli" trailing={<button type="button" aria-label="Actions for Chilli" />} />)
    expect(container.querySelectorAll('.list-row__target')).toHaveLength(0)
    const row = inList(<ListRow title="Chilli" onActivate={() => {}} trailing={<button type="button" aria-label="Actions for Chilli" />} />)
    expect(row.container.querySelectorAll('.list-row__target')).toHaveLength(1)
  })
})
