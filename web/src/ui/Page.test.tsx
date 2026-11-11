// R2-L (L-01): the Page primitive. Width from the prop, else from the shell's context, else default; one container per screen.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Page, PageWidthProvider } from './Page'
import { declarations, readUiCss } from './test-utils'

describe('Page', () => {
  it('renders one .page container carrying data-page-width, with the header above the body', () => {
    const { container } = render(
      <Page width="narrow" header={<h1>Title</h1>}>
        <p>body</p>
      </Page>,
    )
    const pages = container.querySelectorAll('.page')
    expect(pages).toHaveLength(1)
    expect(pages[0]).toHaveAttribute('data-page-width', 'narrow')
    const header = pages[0]!.querySelector('.page__header')!
    const body = pages[0]!.querySelector('.page__body')!
    expect(header).toContainElement(screen.getByRole('heading', { name: 'Title' }))
    expect(body).toHaveTextContent('body')
    expect(header.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it.each(['narrow', 'default', 'wide', 'full'] as const)('width="%s" is written as data-page-width', (w) => {
    const { container } = render(<Page width={w}>x</Page>)
    expect(container.querySelector('.page')).toHaveAttribute('data-page-width', w)
  })
  it('without a prop it takes the width the shell resolved from the route table', () => {
    const { container } = render(
      <PageWidthProvider value="wide">
        <Page>x</Page>
      </PageWidthProvider>,
    )
    expect(container.querySelector('.page')).toHaveAttribute('data-page-width', 'wide')
  })
  it('the prop wins over the context; with neither the width is default', () => {
    const { container, rerender } = render(
      <PageWidthProvider value="wide">
        <Page width="narrow">x</Page>
      </PageWidthProvider>,
    )
    expect(container.querySelector('.page')).toHaveAttribute('data-page-width', 'narrow')
    rerender(<Page>x</Page>)
    expect(container.querySelector('.page')).toHaveAttribute('data-page-width', 'default')
  })
  it('a Page inside a Page (the shell already wraps the route) adds no second container or width', () => {
    const { container } = render(
      <Page width="wide">
        <Page width="narrow">inner</Page>
      </Page>,
    )
    expect(container.querySelectorAll('[data-page-width]')).toHaveLength(1)
    expect(container.querySelector('[data-page-width]')).toHaveAttribute('data-page-width', 'wide')
    expect(container).toHaveTextContent('inner')
  })
  it('omits the header wrapper when there is no header', () => {
    const { container } = render(<Page>x</Page>)
    expect(container.querySelector('.page__header')).toBeNull()
  })
})

describe('Page.css', () => {
  const css = readUiCss('Page.css')
  const d = (s: string) => declarations(css, s)
  it('centres a content-width column: inline-size 100%, max from --page-max, margin-inline auto, gutter padding', () => {
    const p = d('.page')
    expect(p['inline-size']).toBe('100%')
    expect(p['max-inline-size']).toBe('var(--page-max)')
    expect(p['margin-inline']).toBe('auto')
    expect(p['padding-inline']).toBe('var(--page-gutter)')
    expect(p['box-sizing']).toBe('border-box')
    expect(p['min-inline-size']).toBe('0')
  })
  it('each width token is the CONTENT width: the cap adds the two gutters', () => {
    for (const w of ['narrow', 'default', 'wide']) {
      expect(d(`.page[data-page-width='${w}']`)['--page-max']).toBe(`calc(var(--page-${w}) + 2 * var(--page-gutter))`)
    }
  })
  it("'full' has no cap and no centring margin", () => {
    expect(d(".page[data-page-width='full']")['--page-max']).toBe('none')
  })
  it('uses tokens only: no colour literals, no raw px widths', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/)
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/(max-)?(inline-size|width)\s*:\s*\d+px/)
  })
})
