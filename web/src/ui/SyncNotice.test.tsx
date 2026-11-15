// B9-13, RES-03: SyncNotice, the notice for what did not sync ("Couldn't sync the Tick of Carrot.") or synced twice
// ("Carrot was ticked twice"). A tile in the warn or info tone (B9-55, DS-06: was danger): a 24 px icon, a body-strong headline, an optional muted subline,
// optional R-E rows (key, amount at the end, time muted under the key) and secondary small Buttons (R-A outline on --color-surface).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SyncNotice, SyncNoticeStack, stackNotices } from './SyncNotice'
import { declarations, readUiCss } from './test-utils'

describe('SyncNotice: a warn notice says one fact', () => {
  const view = () => {
    const onAdd = vi.fn()
    const onDismiss = vi.fn()
    const r = render(
      <SyncNotice
        tone="warn"
        title="Couldn’t sync the Tick of Carrot."
        subtitle="It is no longer on the Shopping List for this range. Its Stock Lot was not added."
        actions={[
          { label: 'Add to Stock', onClick: onAdd },
          { label: 'Dismiss', onClick: onDismiss },
        ]}
      />,
    )
    return { ...r, onAdd, onDismiss }
  }
  it('is a warn-tone alert: a decorative 24 px icon, the headline, the muted subline', () => {
    const { container } = view()
    const n = screen.getByRole('alert')
    expect(n).toHaveClass('sync-notice')
    expect(n).toHaveAttribute('data-tone', 'warn')
    expect(within(n).getByText('Couldn’t sync the Tick of Carrot.')).toHaveClass('sync-notice__title')
    expect(within(n).getByText(/Its Stock Lot was not added/)).toHaveClass('sync-notice__subline')
    const icon = container.querySelector('.sync-notice__icon svg')!
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveAttribute('width', '24')
  })
  it('has no rows block without rows', () => {
    const { container } = view()
    expect(container.querySelector('.sync-notice__rows')).toBeNull()
  })
  it('its actions are Buttons in order: secondary, small', async () => {
    const { onAdd, onDismiss } = view()
    const buttons = within(screen.getByRole('alert')).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Add to Stock', 'Dismiss'])
    for (const b of buttons) {
      expect(b).toHaveClass('button')
      expect(b).toHaveAttribute('data-variant', 'secondary')
      expect(b).toHaveAttribute('data-size', 'sm')
    }
    await userEvent.click(buttons[0]!)
    expect(onAdd).toHaveBeenCalledOnce()
    await userEvent.click(buttons[1]!)
    expect(onDismiss).toHaveBeenCalledOnce()
  })
  it('the actions follow the text in DOM order', () => {
    view()
    const n = screen.getByRole('alert')
    const actions = n.querySelector('.sync-notice__actions')!
    expect(actions).not.toBeNull()
    expect(n.querySelector('.sync-notice__title')!.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('no subline and no actions are fine: just the icon and the headline', () => {
    const { container } = render(<SyncNotice tone="warn" title="Couldn’t sync a Scan: Rice organic pack" />)
    expect(container.querySelector('.sync-notice__subline')).toBeNull()
    expect(container.querySelector('.sync-notice__actions')).toBeNull()
  })
})

describe('SyncNotice: an info notice with R-E rows', () => {
  const view = () =>
    render(
      <SyncNotice
        tone="info"
        title="Carrot was ticked twice"
        subtitle="Both Stock Lots were added · 100 g in all"
        rows={[
          { key: 'Sam', amount: '50 g', time: 'Ticked at 10:12' },
          { key: 'You', amount: '50 g', time: 'Ticked offline at 10:20 · synced 10:31' },
        ]}
        actions={[
          { label: 'Take mine back', onClick: () => {} },
          { label: 'Dismiss', onClick: () => {} },
        ]}
      />,
    )
  it('is an info-tone status (it can appear while nobody is looking, so it is polite, not an alert)', () => {
    view()
    const n = screen.getByRole('status')
    expect(n).toHaveAttribute('data-tone', 'info')
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('one row per addition in a list: the key, the amount at the end, the time under the key', () => {
    const { container } = view()
    const list = container.querySelector('ul.sync-notice__rows')!
    const rows = within(list as HTMLElement).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const [sam, you] = rows as HTMLElement[]
    expect(sam!.querySelector('.sync-notice__key')).toHaveTextContent('Sam')
    expect(sam!.querySelector('.sync-notice__amount')).toHaveTextContent('50 g')
    expect(sam!.querySelector('.sync-notice__time')).toHaveTextContent('Ticked at 10:12')
    expect(you!.querySelector('.sync-notice__time')).toHaveTextContent('Ticked offline at 10:20 · synced 10:31')
    // key before time, amount last: the order the eye and the screen reader both take
    const parts = ['.sync-notice__key', '.sync-notice__time', '.sync-notice__amount'].map((s) => sam!.querySelector(s)!)
    expect(parts[0]!.compareDocumentPosition(parts[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('the rows come after the subline and before the actions', () => {
    const { container } = view()
    const pos = (a: string, b: string) => container.querySelector(a)!.compareDocumentPosition(container.querySelector(b)!) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(pos('.sync-notice__subline', '.sync-notice__rows')).toBeTruthy()
    expect(pos('.sync-notice__rows', '.sync-notice__actions')).toBeTruthy()
  })
  it('a row without a time or amount renders only what it has', () => {
    const { container } = render(<SyncNotice tone="info" title="T" rows={[{ key: 'Sam' }]} />)
    expect(container.querySelector('.sync-notice__time')).toBeNull()
    expect(container.querySelector('.sync-notice__amount')).toBeNull()
  })
})

describe('stackNotices: newest first, at most 3, then "and N more"', () => {
  it('reverses the arrival order and keeps the three newest', () => {
    expect(stackNotices(['a', 'b', 'c', 'd', 'e'])).toEqual({ shown: ['e', 'd', 'c'], more: 2 })
  })
  it('three or fewer: all shown, none counted', () => {
    expect(stackNotices(['a', 'b'])).toEqual({ shown: ['b', 'a'], more: 0 })
    expect(stackNotices([])).toEqual({ shown: [], more: 0 })
    expect(stackNotices(['a', 'b', 'c'])).toEqual({ shown: ['c', 'b', 'a'], more: 0 })
  })
  it('the limit can be given', () => {
    expect(stackNotices(['a', 'b', 'c'], 1)).toEqual({ shown: ['c'], more: 2 })
  })
  it('does not mutate its input', () => {
    const input = ['a', 'b', 'c', 'd']
    stackNotices(input)
    expect(input).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('SyncNoticeStack', () => {
  const notices = ['one', 'two', 'three', 'four', 'five'].map((id) => ({ id, tone: 'warn' as const, title: `Couldn’t sync ${id}` }))
  it('shows the newest three, newest first, and says "and 2 more"', () => {
    render(<SyncNoticeStack notices={notices} />)
    const titles = document.querySelectorAll('.sync-notice__title')
    expect([...titles].map((t) => t.textContent)).toEqual(['Couldn’t sync five', 'Couldn’t sync four', 'Couldn’t sync three'])
    expect(screen.getByText('and 2 more')).toBeInTheDocument()
  })
  it('with three or fewer there is no "more" line', () => {
    render(<SyncNoticeStack notices={notices.slice(0, 2)} />)
    expect(screen.queryByText(/more$/)).toBeNull()
    expect(document.querySelectorAll('.sync-notice')).toHaveLength(2)
  })
  it('"and 1 more" for one left out', () => {
    render(<SyncNoticeStack notices={notices.slice(0, 4)} />)
    expect(screen.getByText('and 1 more')).toBeInTheDocument()
  })
  it('renders nothing for an empty stack', () => {
    const { container } = render(<SyncNoticeStack notices={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('SyncNotice.css', () => {
  const css = readUiCss('SyncNotice.css')
  it('the tile: --radius-tile-sm, --space-4 padding', () => {
    const d = declarations(css, '.sync-notice')
    expect(d['border-radius']).toBe('var(--radius-tile-sm)')
    expect(d.padding).toBe('var(--space-4)')
  })
  it('warn is the warn status pair with its 1 px rule, as the warn Tile (B9-55, DS-06); info is the info pair', () => {
    const warn = declarations(css, ".sync-notice[data-tone='warn']")
    expect(warn.background).toBe('var(--status-warn-bg)')
    expect(warn.color).toBe('var(--status-warn-fg)')
    expect(warn.border).toBe('1px solid var(--status-warn-fg)')
    const info = declarations(css, ".sync-notice[data-tone='info']")
    expect(info.background).toBe('var(--color-info-bg)')
    expect(info.color).toBe('var(--color-info-fg)')
  })
  it('the headline is body-strong, the subline meta', () => {
    expect(declarations(css, '.sync-notice__title')['font-weight']).toBe('var(--text-body-strong-weight)')
    expect(declarations(css, '.sync-notice__subline')['font-size']).toBe('var(--text-meta-size)')
  })
  it('an amount is tabular, in the notice tone; a time is muted meta', () => {
    expect(declarations(css, '.sync-notice__amount')['font-variant-numeric']).toBe('tabular-nums')
    expect(declarations(css, '.sync-notice__time')['font-size']).toBe('var(--text-meta-size)')
  })
  it('the actions sit on --color-surface with the R-A 1 px outline, in their own wrapping row', () => {
    const d = declarations(css, '.sync-notice .button[data-variant="secondary"]')
    expect(d.background).toBe('var(--color-surface)')
    expect(d['box-shadow']).toMatch(/inset 0 0 0 1px var\(--color-outline\)/)
    expect(declarations(css, '.sync-notice__actions')['flex-wrap']).toBe('wrap')
  })
  it('uses tokens only: no hex colours and no raw px radii', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/border-radius:\s*\d+px/)
  })
})
