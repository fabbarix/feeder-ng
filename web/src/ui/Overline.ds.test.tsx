// DS-07: Overline is the overline role (12/16, 800, caps, tracking 0.04em) in --color-muted where it is not inside a tone.
// It replaces .settings__overline and .access__overline. Tile's own `overline` keeps rendering it inside a tone.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Overline } from './Overline'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('Overline.css')
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('Overline: element and class', () => {
  it('renders a <p> by default with the overline class', () => {
    render(<Overline>Household</Overline>)
    const el = screen.getByText('Household')
    expect(el.tagName).toBe('P')
    expect(el).toHaveClass('overline')
  })
  it('as="span" renders a <span>', () => {
    render(<Overline as="span">New</Overline>)
    expect(screen.getByText('New').tagName).toBe('SPAN')
  })
  it('is not a heading: it never enters the document outline', () => {
    render(<Overline>Household</Overline>)
    expect(screen.queryByRole('heading')).toBeNull()
  })
})

describe('Overline.css: the overline role in the muted colour', () => {
  it('uses the overline tokens, upper case, and --color-muted', () => {
    const d = declarations(css, '.overline')
    expect(d['font-size']).toBe('var(--text-overline-size)')
    expect(d['line-height']).toBe('var(--text-overline-line)')
    expect(d['font-weight']).toBe('var(--text-overline-weight)')
    expect(d['letter-spacing']).toBe('var(--text-overline-tracking)')
    expect(d['text-transform']).toBe('uppercase')
    expect(d['color']).toBe('var(--color-muted)')
    expect(d['margin']).toBe('0')
  })
  it('never mutes by opacity (the old .settings__overline was opacity 0.75), and sets no px or hex', () => {
    expect(code).not.toMatch(/opacity/)
    expect(code).not.toMatch(/\d+px/)
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})

describe('Overline.css exists', () => {
  it('is a stylesheet of its own, imported by the component', () => {
    expect(css.trim()).not.toBe('')
  })
})
