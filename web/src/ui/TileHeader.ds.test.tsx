// DS-07: TileHeader is the title row of a tile ("To confirm", "Leftovers to use", "To get"; system.md §9): a 32 px icon badge in
// the tile's tone or neutral, the SectionTitle, a count Chip, an optional trailing IconButton or Menu. It reproduces the To confirm
// row and has no new visual; it replaces .to-confirm__heading and the hand-built title rows.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconButton } from './IconButton'
import { TileHeader } from './TileHeader'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('TileHeader.css')
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('TileHeader: anatomy', () => {
  it('renders the title as an h2 by default and as an h3 on request', () => {
    const { rerender } = render(<TileHeader icon="markCooked" title="To confirm" />)
    expect(screen.getByRole('heading', { level: 2, name: 'To confirm' })).toHaveClass('section-title')
    rerender(<TileHeader icon="markCooked" title="To confirm" as="h3" />)
    expect(screen.getByRole('heading', { level: 3, name: 'To confirm' })).toBeInTheDocument()
  })

  it('has one icon badge, decorative, in the neutral tone by default', () => {
    const { container } = render(<TileHeader icon="markCooked" title="To confirm" />)
    const badge = container.querySelector('.tile-header__badge')
    expect(badge).not.toBeNull()
    expect(badge).toHaveAttribute('data-tone', 'neutral')
    expect(badge!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(badge!.textContent).toBe('')
  })

  it.each(['info', 'leftover', 'spoil', 'warn', 'danger'] as const)('tone="%s" is written on the badge', (tone) => {
    const { container } = render(<TileHeader icon="markCooked" tone={tone} title="To confirm" />)
    expect(container.querySelector('.tile-header__badge')).toHaveAttribute('data-tone', tone)
  })

  it('shows the count as a count Chip after the title, and none without a count', () => {
    const { container, rerender } = render(<TileHeader icon="markCooked" title="To confirm" count={3} />)
    const chip = container.querySelector('.chip[data-kind="count"]')
    expect(chip).toHaveTextContent('3')
    const nodes = [...container.querySelectorAll('.section-title, .chip')]
    expect(nodes[0]).toHaveClass('section-title')
    expect(nodes[1]).toBe(chip)
    rerender(<TileHeader icon="markCooked" title="To confirm" />)
    expect(container.querySelector('.chip')).toBeNull()
  })

  it('a count of 0 is still shown (an empty list says so)', () => {
    const { container } = render(<TileHeader icon="markCooked" title="To get" count={0} />)
    expect(container.querySelector('.chip[data-kind="count"]')).toHaveTextContent('0')
  })

  it('renders the trailing action last, and it stays a real control with its own name', () => {
    const { container } = render(<TileHeader icon="markCooked" title="To confirm" count={2} action={<IconButton icon="close" label="Hide" />} />)
    const header = container.firstElementChild as HTMLElement
    const button = within(header).getByRole('button', { name: 'Hide' })
    expect(header.lastElementChild!.contains(button)).toBe(true)
  })

  it('the title carries titleId, so the tile section is named by it (aria-labelledby, TB-09)', () => {
    render(
      <section aria-labelledby="tc-title">
        <TileHeader icon="markCooked" title="To confirm" titleId="tc-title" count={2} countLabel="2 items" />
      </section>,
    )
    expect(screen.getByRole('region', { name: 'To confirm' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '2 items' })).toHaveTextContent('2')
  })

  it('the row is one element (a div), so the tile decides the heading outline, not the header', () => {
    const { container } = render(<TileHeader icon="markCooked" title="To confirm" />)
    expect(container.firstElementChild!.tagName).toBe('DIV')
    expect(container.firstElementChild).toHaveClass('tile-header')
  })
})

describe('TileHeader.css: the To confirm row', () => {
  it('is a flex row, items centred, the title takes the free room', () => {
    const d = declarations(css, '.tile-header')
    expect(d['display']).toBe('flex')
    expect(d['align-items']).toBe('center')
    expect(d['gap']).toMatch(/^var\(--space-[23]\)$/)
    expect(d['min-inline-size']).toBe('0')
    expect(declarations(css, '.tile-header > .section-title')['flex']).toBe('1 1 auto')
  })

  it('the badge is a 32 px circle (2rem is the existing .to-confirm__badge size) on the chip radius', () => {
    const d = declarations(css, '.tile-header__badge')
    expect(d['inline-size']).toMatch(/^(2rem|32px)$/)
    expect(d['block-size']).toMatch(/^(2rem|32px)$/)
    expect(d['border-radius']).toBe('var(--radius-chip)')
    expect(d['flex']).toBe('none')
  })

  it('the neutral badge is a surface-2 fill with a text icon; a tone uses its own fg and bg tokens', () => {
    expect(declarations(css, ".tile-header__badge[data-tone='neutral']")).toMatchObject({ background: 'var(--color-surface-2)', color: 'var(--color-text)' })
    expect(declarations(css, ".tile-header__badge[data-tone='info']")).toMatchObject({ background: 'var(--color-info-bg)', color: 'var(--color-info-fg)' })
    for (const tone of ['leftover', 'spoil', 'warn', 'danger', 'success', 'pinned']) {
      expect(declarations(css, `.tile-header__badge[data-tone='${tone}']`), tone).toMatchObject({ background: `var(--status-${tone}-bg)`, color: `var(--status-${tone}-fg)` })
    }
  })

  it('on a status tile the badge and the count are surface fills over the tint (TB-09, R-A)', () => {
    expect(declarations(css, ".tile[data-variant='status'] .tile-header__badge")['background']).toBe('var(--color-surface)')
    expect(declarations(css, ".tile[data-variant='status'] .tile-header > .chip[data-kind='count']")['background']).toBe('var(--color-surface)')
  })

  it('no px (the badge is in rem), no hex and no opacity', () => {
    expect(code).not.toMatch(/\d+px/)
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(code).not.toMatch(/opacity/)
  })
})

describe('TileHeader.css exists', () => {
  it('is a stylesheet of its own, imported by the component', () => {
    expect(css.trim()).not.toBe('')
  })
})
