// Beta.5 WP D: the expandable ListRow (docs/dev/design/b5-d-shared-web.md). Disclosure semantics: a button with
// aria-expanded / aria-controls, keyboard operable; the panel is in the DOM but hidden while collapsed.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from './IconButton'
import { ListGroup, ListRow } from './ListRow'
import { declarations, readUiCss } from './test-utils'

const inList = (...rows: React.ReactNode[]) => render(<ListGroup label="Pantry">{rows}</ListGroup>)
const panel = <p>Opened 1 Jun</p>

describe('ListRow expandable', () => {
  it('the target is one button named after the title, collapsed: aria-expanded false', () => {
    inList(<ListRow title="Flour" meta="2 kg" expanded={false} onToggle={() => {}} panel={panel} chevron />)
    const b = screen.getByRole('button', { name: 'Flour' })
    expect(b).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('aria-controls names the panel; collapsed it is hidden but still in the DOM', () => {
    inList(<ListRow title="Flour" expanded={false} onToggle={() => {}} panel={panel} />)
    const id = screen.getByRole('button', { name: 'Flour' }).getAttribute('aria-controls')
    expect(id).toBeTruthy()
    const el = document.getElementById(id!)!
    expect(el).not.toBeNull()
    expect(el).toHaveAttribute('hidden')
    expect(screen.queryByText('Opened 1 Jun')).not.toBeVisible()
  })

  it('expanded: aria-expanded true, the panel is visible, the row is marked and grows with its panel', () => {
    inList(<ListRow title="Flour" expanded onToggle={() => {}} panel={panel} />)
    const b = screen.getByRole('button', { name: 'Flour' })
    expect(b).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Opened 1 Jun')).toBeVisible()
    expect(document.getElementById(b.getAttribute('aria-controls')!)).not.toHaveAttribute('hidden')
    const row = screen.getByRole('listitem')
    expect(row).toHaveAttribute('data-expanded', 'true')
    expect(row).toHaveAttribute('data-height', 'auto')
  })

  it('a collapsed row keeps its normal height and is not marked expanded', () => {
    inList(<ListRow title="Flour" meta="2 kg" expanded={false} onToggle={() => {}} panel={panel} />)
    const row = screen.getByRole('listitem')
    expect(row).not.toHaveAttribute('data-expanded')
    expect(row).toHaveAttribute('data-height', '64')
  })

  it('a click calls onToggle once; the row does not flip its own state', async () => {
    const onToggle = vi.fn()
    inList(<ListRow title="Flour" expanded={false} onToggle={onToggle} panel={panel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Flour' }))
    expect(onToggle).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Flour' })).toHaveAttribute('aria-expanded', 'false')
  })

  it.each(['{Enter}', ' '])('the keyboard toggles it (%j)', async (key) => {
    const onToggle = vi.fn()
    inList(<ListRow title="Flour" expanded={false} onToggle={onToggle} panel={panel} />)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Flour' })).toHaveFocus()
    await userEvent.keyboard(key)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('every row has its own panel id', () => {
    inList(
      <ListRow key="a" title="Flour" expanded onToggle={() => {}} panel={panel} />,
      <ListRow key="b" title="Rice" expanded onToggle={() => {}} panel={<p>Other</p>} />,
    )
    const [a, b] = screen.getAllByRole('button').map((x) => x.getAttribute('aria-controls'))
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    expect(a).not.toBe(b)
  })

  it('a trailing IconButton works on its own and does not toggle', async () => {
    const onToggle = vi.fn()
    const onMore = vi.fn()
    inList(<ListRow title="Flour" expanded={false} onToggle={onToggle} panel={panel} trailing={<IconButton icon="more" label="More for Flour" onClick={onMore} />} />)
    await userEvent.click(screen.getByRole('button', { name: 'More for Flour' }))
    expect(onMore).toHaveBeenCalledOnce()
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('interactive content in the panel is reachable and does not toggle', async () => {
    const onToggle = vi.fn()
    const inner = vi.fn()
    inList(<ListRow title="Flour" expanded onToggle={onToggle} panel={<button type="button" onClick={inner}>Edit lot</button>} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit lot' }))
    expect(inner).toHaveBeenCalledOnce()
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('the chevron stays decorative', () => {
    const { container } = inList(<ListRow title="Flour" expanded={false} onToggle={() => {}} chevron />)
    expect(container.querySelector('.list-row__chevron svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('a row without onToggle has no disclosure semantics and renders no panel', () => {
    inList(<ListRow title="Flour" onActivate={() => {}} />)
    const b = screen.getByRole('button', { name: 'Flour' })
    expect(b).not.toHaveAttribute('aria-expanded')
    expect(b).not.toHaveAttribute('aria-controls')
    expect(screen.getByRole('listitem')).not.toHaveAttribute('data-expanded')
  })

  it('a ReactNode title needs an aria-label to name the toggle (type error otherwise)', () => {
    const rich = <span>Rich</span>
    // @ts-expect-error a toggling row with a ReactNode title and no aria-label has no name
    const bad = <ListRow title={rich} expanded={false} onToggle={() => {}} />
    const ok = <ListRow title={rich} aria-label="Rich" expanded={false} onToggle={() => {}} />
    expect([bad, ok]).toHaveLength(2)
  })

  it('rejects onToggle together with href or onActivate, and onToggle without expanded, at the type level', () => {
    // @ts-expect-error one target only
    const a = <ListRow title="x" expanded={false} onToggle={() => {}} onActivate={() => {}} />
    // @ts-expect-error one target only
    const b = <ListRow title="x" expanded={false} onToggle={() => {}} href="/a" />
    // @ts-expect-error expanded is required with onToggle
    const c = <ListRow title="x" onToggle={() => {}} />
    expect([a, b, c]).toHaveLength(3)
  })
})

describe('ListRow expandable styling', () => {
  const css = readUiCss('ListRow.css')
  it('the panel spans the row below the header and catches the pointer (it is not click-through)', () => {
    const d = declarations(css, '.list-row__panel')
    expect(d['flex-basis']).toBe('100%')
    expect(d['pointer-events']).toBe('auto')
  })
  it('the chevron turns a quarter when expanded', () => {
    const d = declarations(css, ".list-row[data-expanded='true'] .list-row__chevron")
    expect(d.transform).toMatch(/rotate\(90deg\)/)
  })
})
