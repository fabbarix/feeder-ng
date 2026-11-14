// B9-01 / DS-12 R-E: ui/DetailList + DetailRow carry "key, state, detail" rows. Read-only, dense, not a ListRow.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DetailList, DetailRow } from './DetailList'
import { declarations, readUiCss } from './test-utils'

const rows = (
  <DetailList tone="spoil">
    <DetailRow label="Flour" state="200 g short" detail="The Recipe used 300 g · Stock showed 100 g" />
    <DetailRow label="Milk" state="1 l short" />
  </DetailList>
)

describe('DetailList (DS-12 R-E)', () => {
  it('is a <ul role="list"> with one <li> per row', () => {
    const { container } = render(rows)
    const ul = container.querySelector('ul')!
    expect(ul).toHaveAttribute('role', 'list')
    expect(within(ul).getAllByRole('listitem')).toHaveLength(2)
  })

  it('reads in DOM order key, state, detail', () => {
    render(rows)
    const first = screen.getAllByRole('listitem')[0]!
    expect(first.textContent).toBe('Flour200 g shortThe Recipe used 300 g · Stock showed 100 g')
    const order = [...first.children].map((c) => c.className)
    expect(order[0]).toMatch(/detail-row__label/)
    expect(order[1]).toMatch(/detail-row__state/)
    expect(order[2]).toMatch(/detail-row__detail/)
  })

  it('a row without a detail renders no detail element', () => {
    render(rows)
    const second = screen.getAllByRole('listitem')[1]!
    expect(second.querySelector('.detail-row__detail')).toBeNull()
  })

  it('carries the tone on the list (default neutral)', () => {
    const { container, rerender } = render(rows)
    expect(container.querySelector('.detail-list')).toHaveAttribute('data-tone', 'spoil')
    rerender(<DetailList><DetailRow label="A" state="1" /></DetailList>)
    expect(container.querySelector('.detail-list')).toHaveAttribute('data-tone', 'neutral')
  })

  it.each(['info', 'warn', 'spoil', 'danger', 'leftover', 'success', 'neutral'] as const)('accepts tone %s', (tone) => {
    const { container } = render(<DetailList tone={tone}><DetailRow label="A" state="1" /></DetailList>)
    expect(container.querySelector('.detail-list')).toHaveAttribute('data-tone', tone)
  })
})

describe('DetailList.css (DS-12 R-E tokens)', () => {
  const css = readUiCss('DetailList.css')

  it('a row is a two-column grid: key | state, detail spanning both', () => {
    const row = declarations(css, '.detail-row')
    expect(row['display']).toBe('grid')
    expect(row['grid-template-columns']).toBe('minmax(0, 1fr) auto')
    expect(row['column-gap']).toBe('var(--space-3)')
    expect(row['row-gap']).toBe('2px')
    expect(row['padding-block']).toBe('var(--space-2)')
    expect(declarations(css, '.detail-row__detail')['grid-column']).toMatch(/1\s*\/\s*-1|1\s*\/\s*span 2/)
  })

  it('the state is end-aligned, nowrap and set in tabular figures; so is the detail', () => {
    const s = declarations(css, '.detail-row__state')
    expect(s['text-align']).toMatch(/end|right/)
    expect(s['white-space']).toBe('nowrap')
    expect(s['font-variant-numeric']).toBe('tabular-nums')
    expect(declarations(css, '.detail-row__detail')['font-variant-numeric']).toBe('tabular-nums')
  })

  it('the key is the text colour, the detail is muted', () => {
    expect(declarations(css, '.detail-row__label')['color']).toBe('var(--color-text)')
    expect(declarations(css, '.detail-row__detail')['color']).toBe('var(--color-muted)')
  })

  it.each(['info', 'warn', 'spoil', 'danger', 'leftover', 'success'])('the %s state takes the tone foreground; neutral takes the text colour', (tone) => {
    expect(declarations(css, `.detail-list[data-tone='${tone}'] .detail-row__state`)['color']).toBe(`var(--status-${tone}-fg)`)
  })

  it('neutral state is --color-text', () => {
    expect(declarations(css, ".detail-list[data-tone='neutral'] .detail-row__state")['color']).toBe('var(--color-text)')
  })

  it('a divider is a 1 px decorative hairline at 18 % of the tone fg between rows; no fill on a tint', () => {
    expect(css).toMatch(/color-mix\(in srgb,[^)]*18%,\s*transparent\)/)
    expect(declarations(css, '.detail-list')['background'] ?? 'none').toMatch(/^(none|transparent)$/)
  })
})
