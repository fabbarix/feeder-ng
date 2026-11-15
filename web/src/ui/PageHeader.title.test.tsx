// B9-19 (A11Y-01): PageHeader sets document.title from its title and its parent crumb, and its h1 is the route-focus target.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader'
import { ruleBlocks, readUiCss } from './test-utils'

afterEach(() => {
  document.title = ''
})
const show = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('PageHeader document title (A11Y-01)', () => {
  it('a page without breadcrumbs is "<h1> · Feeder"', () => {
    show(<PageHeader title="Plan" />)
    expect(document.title).toBe('Plan · Feeder')
  })

  it('a Recipe page names the Recipe and its section: "<h1> · <parent> · Feeder"', () => {
    show(<PageHeader title="Pasta al pomodoro" breadcrumbs={[{ label: 'Recipes', to: '/recipes' }, { label: 'Pasta al pomodoro' }]} />)
    expect(document.title).toBe('Pasta al pomodoro · Recipes · Feeder')
  })

  it('the parent is the crumb just before the current page, not the root of a deeper trail', () => {
    show(
      <PageHeader
        title="Edit Recipe"
        breadcrumbs={[{ label: 'Recipes', to: '/recipes' }, { label: 'Pasta al pomodoro', to: '/recipes/1' }, { label: 'Edit Recipe' }]}
      />,
    )
    expect(document.title).toBe('Edit Recipe · Pasta al pomodoro · Feeder')
  })

  it('a documentTitle replaces the h1 text in the title (a heading that is a question) and keeps the parent', () => {
    show(<PageHeader title="Which shop are you in?" documentTitle="Scan" />)
    expect(document.title).toBe('Scan · Feeder')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Which shop are you in?')
  })

  it('follows a change of the title', () => {
    const { rerender } = show(<PageHeader title="Recipes" />)
    rerender(
      <MemoryRouter>
        <PageHeader title="Base recipes" />
      </MemoryRouter>,
    )
    expect(document.title).toBe('Base recipes · Feeder')
  })
})

describe('PageHeader h1 is the route-focus target (A11Y-01)', () => {
  it('has id="page-title" and tabIndex -1 (focusable by script, never in the Tab order)', () => {
    show(<PageHeader title="Pantry" />)
    const h1 = screen.getByRole('heading', { level: 1, name: 'Pantry' })
    expect(h1).toHaveAttribute('id', 'page-title')
    expect(h1).toHaveAttribute('tabindex', '-1')
    h1.focus()
    expect(h1).toHaveFocus()
  })

  it('draws no ring when focused: it is not an operable control', () => {
    const blocks = ruleBlocks(readUiCss('PageHeader.css'))
    const rule = blocks.find((b) => b.selectors.includes('.page-header__title:focus'))
    expect(rule?.body ?? '').toMatch(/outline\s*:\s*none/)
  })
})
