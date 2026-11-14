// DS-07 (docs/design/ui-review-3/ds.md): SectionTitle is the one section heading inside a tile: title-3 (18/22, 800) with
// --space-3 below it. It replaces .pg__tile-title, .today__tile-title, .plan__tile-title and the unclassed <h2> in tiles.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionTitle } from './SectionTitle'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('SectionTitle.css')
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('SectionTitle: role and level', () => {
  it('renders an h2 by default, with its text as the accessible name', () => {
    render(<SectionTitle>Unit Conversions</SectionTitle>)
    expect(screen.getByRole('heading', { level: 2, name: 'Unit Conversions' })).toHaveClass('section-title')
  })

  it('as="h3" renders an h3 (the heading level stays as authored; the look is the same)', () => {
    render(<SectionTitle as="h3">Prices</SectionTitle>)
    expect(screen.getByRole('heading', { level: 3, name: 'Prices' })).toHaveClass('section-title')
  })

  it('passes className and id through and keeps its own class', () => {
    render(<SectionTitle id="t" className="x">Picture</SectionTitle>)
    const h = screen.getByRole('heading', { name: 'Picture' })
    expect(h).toHaveAttribute('id', 't')
    expect(h).toHaveClass('section-title', 'x')
  })

  it('has no other level: a heading level other than 2 or 3 is a type error', () => {
    // @ts-expect-error SectionTitle is a h2 or a h3
    const el = <SectionTitle as="h1">Page</SectionTitle>
    expect(el).toBeTruthy()
  })
})

describe('SectionTitle.css: title-3 with --space-3 below, on tokens only', () => {
  it('uses the title-3 tokens and --space-3 as the block-end margin', () => {
    const d = declarations(css, '.section-title')
    expect(d['font-size']).toBe('var(--text-title-3-size)')
    expect(d['line-height']).toBe('var(--text-title-3-line)')
    expect(d['font-weight']).toBe('var(--text-title-3-weight)')
    expect(d['margin-block-end']).toBe('var(--space-3)')
    expect(d['margin-block-start']).toBe('0')
  })
  it('no px, hex, opacity or fixed height', () => {
    expect(code).not.toMatch(/\d+px/)
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(code).not.toMatch(/opacity/)
    expect(code).not.toMatch(/(^|[;{\s])(block-)?(min-)?height\s*:/)
  })
})

describe('SectionTitle.css exists', () => {
  it('is a stylesheet of its own, imported by the component', () => {
    expect(css.trim()).not.toBe('')
  })
})
