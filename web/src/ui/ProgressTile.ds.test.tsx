// DS-A round 2 (docs/design/system.md §2, §4): metric tiles are neutral or status-toned, never accent-soft. With a red accent the
// accent-soft "Left to get" tile read as alarm (review-shop/shop-1024-light-tomato.png). The accent is kept for the one primary
// action, the active nav item and the today ring; progress is the success tone.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressTile } from './ProgressTile'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('ProgressTile.css')

describe('ProgressTile is a neutral metric tile', () => {
  it('renders a surface Tile, not a soft one', () => {
    const { container } = render(<ProgressTile label="Left to get" value={2} max={18} />)
    const tile = container.querySelector('.tile')!
    expect(tile).not.toHaveAttribute('data-variant', 'soft')
    expect(['surface', null]).toContain(tile.getAttribute('data-variant'))
  })
  it('the track is surface-2 and the fill is the success tone (no accent, no soft)', () => {
    // --status-success-fg, not -solid: the solid (#0a7e3a, made for white text) is under 3:1 on every dark surface; the fg is the
    // tone's readable colour in both schemes (theme/contrast.test.ts checks it on surface-2 for every palette).
    expect(declarations(css, '.progress-tile__bar')['background']).toBe('var(--color-surface-2)')
    expect(declarations(css, '.progress-tile__fill')['background']).toBe('var(--status-success-fg)')
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/--color-(soft|accent)/)
  })
  it('the label is muted, the value is text colour', () => {
    expect(declarations(css, '.progress-tile__label')['color']).toBe('var(--color-muted)')
  })
})
