// DS-A (docs/design/system.md §3): one row anatomy for every list.
//   [control 44] [picture 40] [title <= 2 lines, wraps at a word / meta 1 line] [value >= --row-value-min, end, tabular]
// Every row is at least 64 px (72 with a picture) and grows with a two-line title; the whole row is the tap target.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ListGroup, ListRow } from './ListRow'
import { declarations, readStylesCss, readUiCss, ruleBlocks } from './test-utils'

const css = readUiCss('ListRow.css')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const inList = (row: React.ReactNode) => render(<ListGroup label="To get">{row}</ListGroup>)

describe('ListRow anatomy: render', () => {
  it('renders the value column and its sub-value after the text', () => {
    const { container } = inList(<ListRow title="Chicken breast" meta="3 packs · 500 g" value="1400 g" subValue="€ 14.37" />)
    const value = container.querySelector('.list-row__value')!
    expect(value).toHaveTextContent('1400 g')
    expect(value.querySelector('.list-row__sub-value')).toHaveTextContent('€ 14.37')
    // DOM order = visual order: text column, then the value column
    const text = container.querySelector('.list-row__text')!
    expect(text.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders a leading control (the tick) before the picture; the control keeps its own button', async () => {
    const onTick = vi.fn()
    const onActivate = vi.fn()
    const { container } = inList(
      <ListRow
        title="Cauliflower"
        control={<button type="button" aria-label="Tick Cauliflower" onClick={onTick} />}
        leading={<span data-testid="pic" />}
        value="3000 g"
        onActivate={onActivate}
      />,
    )
    const control = container.querySelector('.list-row__control')!
    expect(control).toBeInTheDocument()
    expect(control.compareDocumentPosition(screen.getByTestId('pic')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Tick Cauliflower' }))
    expect(onTick).toHaveBeenCalledOnce()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('the whole row is one target named after the title; the value is part of the row, not a second button', async () => {
    const onActivate = vi.fn()
    inList(<ListRow title="Gorgonzola dolce" meta="Includes Thu Dinner" metaStatus="info" value="250 g" onActivate={onActivate} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName('Gorgonzola dolce')
    await userEvent.click(buttons[0]!)
    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('a hint goes in the meta line with its tone and icon, never as a third line', () => {
    const { container } = inList(<ListRow title="Lemon" meta="Includes Thu Dinner" metaStatus="info" value="1 piece" />)
    const meta = container.querySelector('.list-row__meta')!
    expect(meta).toHaveAttribute('data-status', 'info')
    expect(meta.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelectorAll('.list-row__text > *')).toHaveLength(2) // title and meta, nothing more
  })

  it('every row is at least 64 px: a one-line row reports 64 (no 56 any more), with a picture 72', () => {
    const { rerender } = inList(<ListRow title="Dill" />)
    expect(screen.getByRole('listitem')).toHaveAttribute('data-height', '64')
    rerender(<ListGroup label="To get"><ListRow title="Dill" value="2 g" /></ListGroup>)
    expect(screen.getByRole('listitem')).toHaveAttribute('data-height', '64')
    rerender(<ListGroup label="To get"><ListRow title="Dill" leading={<span />} /></ListGroup>)
    expect(screen.getByRole('listitem')).toHaveAttribute('data-height', '72')
  })
})

describe('ListRow anatomy: stylesheet', () => {
  it('rows have a minimum height and no fixed one, so a two-line title can grow the row', () => {
    expect(declarations(css, '.list-row')['min-block-size']).toBe('var(--row-min)')
    expect(declarations(css, ".list-row[data-height='72']")['min-block-size']).toBe('72px')
    for (const b of ruleBlocks(code(css))) {
      if (b.selectors.some((s) => /^\.list-row(\[[^\]]*\])*$/.test(s))) expect(b.body, b.selectors.join(', ')).not.toMatch(/(^|[;\s])block-size\s*:/)
    }
  })

  it('the title wraps at a word, up to 2 lines, then ellipsis (no anywhere / break-word / hyphens)', () => {
    const d = declarations(css, '.list-row__title')
    expect(d['white-space']).toBe('normal')
    expect(d['-webkit-line-clamp']).toBe('2')
    expect(d['display']).toBe('-webkit-box')
    expect(d['overflow']).toBe('hidden')
    expect(d['overflow-wrap'] ?? 'normal').toBe('normal')
    expect(d['hyphens'] ?? 'manual').toBe('manual')
    expect(code(css)).not.toMatch(/overflow-wrap:\s*(anywhere|break-word)|word-break:\s*break-(all|word)|hyphens:\s*auto/)
  })

  it('the meta line is one line with an ellipsis', () => {
    const d = declarations(css, '.list-row__meta')
    expect(d['white-space']).toBe('nowrap')
    expect(d['overflow']).toBe('hidden')
    expect(d['text-overflow']).toBe('ellipsis')
  })

  it('the value column has a minimum width, is end-aligned, tabular and never wraps', () => {
    const d = declarations(css, '.list-row__value')
    expect(d['min-inline-size']).toBe('var(--row-value-min)')
    expect(d['text-align']).toBe('end')
    expect(d['font-variant-numeric']).toBe('tabular-nums')
    expect(d['white-space']).toBe('nowrap')
    expect(d['font-size']).toBe('var(--text-body-strong-size)')
    const sub = declarations(css, '.list-row__sub-value')
    expect(sub['font-size']).toBe('var(--text-meta-size)')
    expect(sub['color']).toBe('var(--color-muted)')
  })

  it('the control catches the pointer above the whole-row target: one declaration, at the weight that beats the lift', () => {
    // `.list-row > :not(.list-row__target)` (0,2,0) sets pointer-events none; only a (0,2,0) rule after it restores the control.
    expect(declarations(css, '.list-row > .list-row__control')['pointer-events']).toBe('auto')
    expect(declarations(css, '.list-row__control')['pointer-events']).toBeUndefined() // round 2: the dead duplicate goes
  })

  it('styles.css defines --row-min (64px) and --row-value-min (5.5rem; 4.25rem below 600 px)', () => {
    const styles = code(readStylesCss())
    expect(styles).toMatch(/--row-min:\s*64px/)
    expect(styles).toMatch(/--row-value-min:\s*5\.5rem/)
    expect(styles).toMatch(/@media\s*\(max-width:\s*599px\)\s*\{[^@]*--row-value-min:\s*4\.25rem/)
  })
})
