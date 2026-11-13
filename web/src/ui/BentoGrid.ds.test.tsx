// DS-A (docs/design/system.md §4, ADR 0016): a grid is sized by a minimum tile width, never by a column count, and no tile
// spans extra columns to show status (only `span="full"` fills a whole row).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BentoGrid } from './BentoGrid'
import { declarations, readStylesCss, readUiCss, ruleBlocks } from './test-utils'

const css = readUiCss('BentoGrid.css')
const tileCss = readUiCss('Tile.css')
const styles = readStylesCss()
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

describe('BentoGrid: minimum tile width', () => {
  it.each(['metric', 'card', 'day', 'wide'] as const)('min="%s" is rendered as data-min', (min) => {
    render(<BentoGrid min={min} label="Grid" />)
    expect(screen.getByRole('group', { name: 'Grid' })).toHaveAttribute('data-min', min)
  })

  it('defaults to min="card" and renders no data-columns', () => {
    render(<BentoGrid label="Grid" />)
    const grid = screen.getByRole('group', { name: 'Grid' })
    expect(grid).toHaveAttribute('data-min', 'card')
    expect(grid).not.toHaveAttribute('data-columns')
  })

  it('has no `columns` prop any more (type error)', () => {
    // @ts-expect-error a column count is not a BentoGrid prop (ADR 0016)
    const el = <BentoGrid columns={2} />
    expect(el).toBeTruthy()
  })

  it('the stylesheet lays out auto-fill tracks of minmax(min(var(--tile-min-<min>), 100%), 1fr)', () => {
    for (const min of ['card', 'day', 'wide']) {
      const d = declarations(css, `.bento-grid[data-min='${min}']`)
      expect(d['grid-template-columns'], min).toBe(`repeat(auto-fill, minmax(min(var(--tile-min-${min}), 100%), 1fr))`)
    }
  })

  it('a metric strip fills its row (auto-fit), so small tiles are never a half-width orphan', () => {
    const d = declarations(css, ".bento-grid[data-min='metric']")
    expect(d['grid-template-columns']).toBe('repeat(auto-fit, minmax(min(var(--tile-min-metric), 100%), 1fr))')
  })

  it('a metric strip is one row of up to three on a phone (< 600 px): equal tracks, not two and an orphan', () => {
    const phone = code(css).match(/@media\s*\(max-width:\s*599px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(phone).toMatch(/\.bento-grid\[data-min='metric'\]\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(0,\s*1fr\)\)/)
  })

  it('has no column-count rules left (no data-columns selector)', () => {
    expect(code(css)).not.toMatch(/data-columns/)
  })

  it('tiles start at the top of their track: content is never centred in a stretched neighbour', () => {
    expect(declarations(css, '.bento-grid > .tile')['justify-content']).toBe('flex-start')
  })

  it('styles.css defines the four tile-min tokens (rem)', () => {
    const root = ruleBlocks(code(styles)).find((b) => b.selectors.includes(':root') && /--tile-min-card/.test(b.body))?.body ?? ''
    expect(root).toMatch(/--tile-min-metric:\s*9\.5rem/)
    expect(root).toMatch(/--tile-min-card:\s*20rem/)
    expect(root).toMatch(/--tile-min-day:\s*21rem/)
    expect(root).toMatch(/--tile-min-wide:\s*28rem/)
  })
})

describe('BentoGrid: no status spans', () => {
  // Tile span={2} stays for the kitchen board's fixed 4x3 wall grid (its own CSS, ADR 0016). In a BentoGrid a tile is one
  // track or the whole row: a 2-track "today" tile is what made Plan's today huge and its neighbours cramped.
  it('a span-2 tile inside a BentoGrid takes one track', () => {
    expect(declarations(css, ".bento-grid > .tile[data-span='2']")['grid-column']).toBe('auto')
  })

  it('span full still fills the row', () => {
    expect(declarations(tileCss, ".tile[data-span='full']")['grid-column']).toBe('1 / -1')
  })
})
