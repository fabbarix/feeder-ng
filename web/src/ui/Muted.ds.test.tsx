// DS-07: Muted is the one muted line: meta (13/18, 500) in --color-muted, never an opacity (which measured 4.39:1 and lower).
// It replaces .pg__muted, .settings__muted, .access__muted, .ra__muted, .plan__muted, .notifications__muted and .read-step__muted.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Muted } from './Muted'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('Muted.css')
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('Muted: element and class', () => {
  it('renders a <p> by default', () => {
    const { container } = render(<Muted>Added 3 May</Muted>)
    const el = screen.getByText('Added 3 May')
    expect(el.tagName).toBe('P')
    expect(el).toHaveClass('muted')
    expect(container.children).toHaveLength(1)
  })

  it('as="span" renders a <span> (inline, inside a sentence or a row)', () => {
    render(<Muted as="span">per 100 g</Muted>)
    expect(screen.getByText('per 100 g').tagName).toBe('SPAN')
  })

  it('passes className and id through', () => {
    render(<Muted id="m" className="x">Hint</Muted>)
    expect(screen.getByText('Hint')).toHaveAttribute('id', 'm')
    expect(screen.getByText('Hint')).toHaveClass('muted', 'x')
  })
})

describe('Muted.css: the meta role in the muted colour', () => {
  it('uses the meta tokens and --color-muted', () => {
    const d = declarations(css, '.muted')
    expect(d['font-size']).toBe('var(--text-meta-size)')
    expect(d['line-height']).toBe('var(--text-meta-line)')
    expect(d['font-weight']).toBe('var(--text-meta-weight)')
    expect(d['color']).toBe('var(--color-muted)')
  })
  it('a <p> Muted has no margin of its own (the container spaces it)', () => {
    expect(declarations(css, '.muted')['margin']).toBe('0')
  })
  it('never mutes by opacity, and sets no px or hex', () => {
    expect(code).not.toMatch(/opacity/)
    expect(code).not.toMatch(/\d+px/)
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})

describe('Muted.css exists', () => {
  it('is a stylesheet of its own, imported by the component', () => {
    expect(css.trim()).not.toBe('')
  })
})
