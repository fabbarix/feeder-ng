// R2-L (L-03): the shared sticky action bar. Pages only (not sheets or dialogs: they own FormActions).
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { Page } from './Page'
import { StickyActionBar } from './StickyActionBar'
import { declarations, readUiCss } from './test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

type IOCallback = (entries: { isIntersecting: boolean }[]) => void
let ioCallbacks: IOCallback[] = []
beforeEach(() => {
  ioCallbacks = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IOCallback) {
        ioCallbacks.push(cb)
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

const bar = (props: Partial<React.ComponentProps<typeof StickyActionBar>> = {}) => (
  <StickyActionBar {...props}>
    <FormActions tertiary={<Button variant="tertiary">Cancel</Button>} primary={<Button>Save</Button>} />
  </StickyActionBar>
)

describe('StickyActionBar', () => {
  it('is a labelled group (default "Actions") with an inner row holding the actions', () => {
    const { container } = render(bar())
    const group = screen.getByRole('group', { name: 'Actions' })
    expect(group).toHaveClass('sticky-action-bar')
    expect(group.querySelector('.sticky-action-bar__inner')).toContainElement(screen.getByRole('button', { name: 'Save' }))
    expect(container.querySelectorAll('.sticky-action-bar')).toHaveLength(1)
  })
  it('takes a custom label', () => {
    render(bar({ label: 'Recipe actions' }))
    expect(screen.getByRole('group', { name: 'Recipe actions' })).toBeInTheDocument()
  })
  it("aligns the inner row to the whole page by default, or to the narrow form column (data-column)", () => {
    const { container, rerender } = render(bar())
    expect(container.querySelector('.sticky-action-bar')).toHaveAttribute('data-column', 'page')
    rerender(bar({ column: 'narrow' }))
    expect(container.querySelector('.sticky-action-bar')).toHaveAttribute('data-column', 'narrow')
  })
  it('marks itself stuck only while its natural position is below the viewport (data-stuck, via IntersectionObserver)', () => {
    const { container } = render(bar())
    const el = container.querySelector('.sticky-action-bar')!
    expect(el).toHaveAttribute('data-stuck', 'false')
    expect(ioCallbacks.length).toBeGreaterThan(0)
    act(() => ioCallbacks.forEach((cb) => cb([{ isIntersecting: false }])))
    expect(el).toHaveAttribute('data-stuck', 'true')
    act(() => ioCallbacks.forEach((cb) => cb([{ isIntersecting: true }])))
    expect(el).toHaveAttribute('data-stuck', 'false')
  })
  it('works without IntersectionObserver (never stuck, no throw)', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = render(bar())
    expect(container.querySelector('.sticky-action-bar')).toHaveAttribute('data-stuck', 'false')
  })
  it('keeps the DOM order of the form, then the bar: Tab goes field, Cancel, Save (no tabindex, no focus trap)', async () => {
    render(
      <Page>
        <form>
          <label>
            Name <input />
          </label>
        </form>
        {bar()}
      </Page>,
    )
    await userEvent.tab()
    expect(screen.getByLabelText('Name')).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    expect(document.querySelector('.sticky-action-bar [tabindex]')).toBeNull()
  })
  it('renders inside a Page without adding a second [data-page-width]', () => {
    const { container } = render(<Page width="default">{bar()}</Page>)
    expect(container.querySelectorAll('[data-page-width]')).toHaveLength(1)
    expect(container.querySelector('.page__body .sticky-action-bar')).not.toBeNull()
  })
})

describe('StickyActionBar.css', () => {
  const css = readUiCss('StickyActionBar.css')
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const d = (s: string) => declarations(css, s)
  it('sticks to the bottom clear of the phone bottom bar (--nav-top is 0 from 1024), below the bottom bar in z-order', () => {
    const b = d('.sticky-action-bar')
    expect(b['position']).toBe('sticky')
    // Floats a gutter above the bottom bar's top edge (--nav-top), not --nav-clearance.
    expect(b['bottom']).toBe('calc(var(--nav-top) + var(--page-gutter))')
    expect(Number(b['z-index'])).toBeGreaterThan(0)
    expect(Number(b['z-index'])).toBeLessThan(10) // .bottom-bar is 10
  })
  it('QA-4: its offset comes from the bottom bar tokens (height, inset, safe area), never a literal or the clearance gap', () => {
    const bottom = d('.sticky-action-bar')['bottom']
    expect(bottom).not.toMatch(/\d+px|--nav-clearance|--space-/)
    const shell = (readFileSync(`${cwd}/src/app/shell.css`, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
    const navTop = declarations(shell, ':root')['--nav-top'] ?? ''
    expect(navTop).toMatch(/var\(--nav-height\)/)
    expect(navTop).toMatch(/var\(--nav-inset\)/)
    expect(navTop).toMatch(/env\(safe-area-inset-bottom/)
    expect(navTop).not.toMatch(/--space-/)
  })
  it('QA-4: no padding or margin below the bar that would open a gap above the nav on phones', () => {
    const b = d('.sticky-action-bar')
    expect(b['margin-block-end'] ?? b['margin-bottom'] ?? '0').toMatch(/^0(px)?$/)
  })
  it('is opaque: surface background, no alpha, no blur, no opacity', () => {
    const b = d('.sticky-action-bar')
    expect(b['background']).toBe('var(--color-surface)')
    expect(code).not.toMatch(/rgba?\(|color-mix|backdrop-filter|\bopacity\s*:|transparent/)
  })
  it('stays inside the Page content (no negative gutter margin, never under the rail), padded like a tile', () => {
    const b = d('.sticky-action-bar')
    expect(b['margin-inline']).toBeUndefined()
    expect(b['padding-inline']).toBe('var(--tile-pad)')
  })
  it('floats like the phone bottom bar: full hairline border, tile radius, elevation', () => {
    const b = d('.sticky-action-bar')
    expect(b['border']).toBe('1px solid var(--color-line)')
    expect(b['border-radius']).toBe('var(--radius-tile)')
    expect(b['box-shadow']).toBe('var(--elev-2)')
  })
  it('aligns the inner row: full page by default, the narrow form column when data-column="narrow"', () => {
    expect(d('.sticky-action-bar__inner')['margin-inline']).toBe('auto')
    expect(d(".sticky-action-bar[data-column='narrow'] .sticky-action-bar__inner")['max-inline-size']).toBe('var(--page-narrow)')
  })
  it('respects the safe area from 1024 (where there is no bottom bar above it) and never covers a focused field', () => {
    const wide = /@media \(min-width: 1024px\)\s*\{([\s\S]*?)\n\}/.exec(code)?.[1] ?? ''
    expect(wide).toMatch(/bottom\s*:[^;]*env\(safe-area-inset-bottom/)
    expect(d(':root')['--sticky-bar-clearance']).toBe('calc(2 * var(--space-3) + 1px + 2 * 44px + var(--space-2))')
    expect(d('html:has(.sticky-action-bar)')['scroll-padding-block-end']).toBe('calc(var(--nav-top) + var(--page-gutter) + var(--sticky-bar-clearance))')
  })
  it('uses tokens only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
