// R2-L (L-03): the shared sticky action bar. Pages only (not sheets or dialogs: they own FormActions).
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { Page } from './Page'
import { StickyActionBar } from './StickyActionBar'
import { declarations, readUiCss } from './test-utils'

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
  it('sticks to the bottom clear of the phone bottom bar (--nav-clearance is 0 from 1024), below the bottom bar in z-order', () => {
    const b = d('.sticky-action-bar')
    expect(b['position']).toBe('sticky')
    expect(b['bottom']).toBe('var(--nav-clearance)')
    expect(Number(b['z-index'])).toBeGreaterThan(0)
    expect(Number(b['z-index'])).toBeLessThan(10) // .bottom-bar is 10
  })
  it('is opaque: surface background, no alpha, no blur, no opacity', () => {
    const b = d('.sticky-action-bar')
    expect(b['background']).toBe('var(--color-surface)')
    expect(code).not.toMatch(/rgba?\(|color-mix|backdrop-filter|\bopacity\s*:|transparent/)
  })
  it('spans the Page container edge to edge: negative gutter margin and gutter padding', () => {
    const b = d('.sticky-action-bar')
    expect(b['margin-inline']).toBe('calc(-1 * var(--page-gutter))')
    expect(b['padding-inline']).toBe('var(--page-gutter)')
  })
  it('has a top hairline always and the elevation only while stuck', () => {
    expect(d('.sticky-action-bar')['border-block-start']).toBe('1px solid var(--color-line)')
    expect(d(".sticky-action-bar[data-stuck='true']")['box-shadow']).toBe('var(--elev-2)')
    expect(d('.sticky-action-bar')['box-shadow']).toBeUndefined()
  })
  it('aligns the inner row: full page by default, the narrow form column when data-column="narrow"', () => {
    expect(d('.sticky-action-bar__inner')['margin-inline']).toBe('auto')
    expect(d(".sticky-action-bar[data-column='narrow'] .sticky-action-bar__inner")['max-inline-size']).toBe('var(--page-narrow)')
  })
  it('respects the safe area from 1024 (where there is no bottom bar above it) and never covers a focused field', () => {
    const wide = /@media \(min-width: 1024px\)\s*\{([\s\S]*?)\n\}/.exec(code)?.[1] ?? ''
    expect(wide).toMatch(/padding-block-end\s*:[^;]*env\(safe-area-inset-bottom/)
    expect(d(':root')['--sticky-bar-clearance']).toMatch(/^\d+px$/)
    expect(d('html:has(.sticky-action-bar)')['scroll-padding-block-end']).toBe('var(--sticky-bar-clearance)')
  })
  it('uses tokens only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
