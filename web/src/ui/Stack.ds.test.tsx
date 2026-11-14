// DS-07: Stack (a grid) and Cluster (a wrapping row) are the layout containers on the spacing tokens. They replace .pg,
// .pg__stack, .pg__group and .pg__row, which lived in a feature stylesheet 29 files imported.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Cluster, Stack } from './Stack'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('Stack.css')
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('Stack', () => {
  it('renders a div with the stack class and gap 3 by default', () => {
    render(<Stack data-testid="s">x</Stack>)
    const el = screen.getByTestId('s')
    expect(el.tagName).toBe('DIV')
    expect(el).toHaveClass('stack')
    expect(el).toHaveAttribute('data-gap', '3')
  })
  it.each(['2', '3', '4'] as const)('gap="%s" writes data-gap', (gap) => {
    render(<Stack gap={gap} data-testid="s">x</Stack>)
    expect(screen.getByTestId('s')).toHaveAttribute('data-gap', gap)
  })
  it('a gap other than 2, 3 or 4 is a type error', () => {
    // @ts-expect-error only the spacing steps 2, 3 and 4 exist for a Stack
    const el = <Stack gap="5">x</Stack>
    expect(el).toBeTruthy()
  })
  it('renders the element it is told to (a list keeps its semantics) and passes className through', () => {
    render(<Stack as="ul" className="x" data-testid="s"><li>a</li></Stack>)
    const el = screen.getByTestId('s')
    expect(el.tagName).toBe('UL')
    expect(el).toHaveClass('stack', 'x')
    expect(screen.getByRole('list')).toBe(el)
  })
  it('the stylesheet is a grid whose gap is the spacing token of data-gap', () => {
    expect(declarations(css, '.stack')['display']).toBe('grid')
    for (const g of ['2', '3', '4']) expect(declarations(css, `.stack[data-gap='${g}']`)['gap'], g).toBe(`var(--space-${g})`)
    expect(declarations(css, '.stack')['min-inline-size']).toBe('0')
  })
})

describe('Cluster', () => {
  it('renders a div with the cluster class and gap 2', () => {
    render(<Cluster data-testid="c">x</Cluster>)
    const el = screen.getByTestId('c')
    expect(el.tagName).toBe('DIV')
    expect(el).toHaveClass('cluster')
  })
  it('the stylesheet is a wrapping flex row with --space-2 between its children', () => {
    const d = declarations(css, '.cluster')
    expect(d['display']).toBe('flex')
    expect(d['flex-wrap']).toBe('wrap')
    expect(d['gap']).toBe('var(--space-2)')
    expect(d['align-items']).toBe('center')
  })
  it('a child may position itself: the container sets no fixed alignment on its children', () => {
    expect(code).not.toMatch(/\.cluster\s*>\s*\*\s*\{[^}]*align-self/)
  })
})

describe('Stack.css uses tokens only', () => {
  it('no px, hex or spacing margins (only the reset margin: 0)', () => {
    expect(code).not.toMatch(/\d+px/)
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    for (const m of code.matchAll(/margin[\w-]*\s*:\s*([^;}]+)/g)) expect((m[1] ?? '').trim(), m[0]).toBe('0')
  })
  it('a list rendered as a Stack or a Cluster drops the UA margin, indent and bullets', () => {
    const d = declarations(css, ':is(ul, ol):is(.stack, .cluster)')
    expect(d['margin']).toBe('0')
    expect(d['padding']).toBe('0')
    expect(d['list-style']).toBe('none')
  })
})

describe('Stack.css exists', () => {
  it('is a stylesheet of its own, imported by the component', () => {
    expect(css.trim()).not.toBe('')
  })
})
