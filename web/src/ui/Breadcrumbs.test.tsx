// R11a: the shared Breadcrumbs primitive (replaces BackLink). Ancestors are links, the current page is plain text.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Breadcrumbs } from './Breadcrumbs'

const two = [{ label: 'Settings', to: '/settings' }, { label: 'Meal Slots' }]
const three = [{ label: 'Recipes', to: '/recipes' }, { label: 'Chicken & leek pie', to: '/recipes/7' }, { label: 'Edit' }]

const show = (items: Array<{ label: string; to?: string }>) =>
  render(
    <MemoryRouter>
      <Breadcrumbs items={items} />
    </MemoryRouter>,
  )

describe('Breadcrumbs', () => {
  it('is a nav named Breadcrumb holding an ordered list, one item per crumb', () => {
    show(three)
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const list = within(nav).getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('ancestors are links to their path, in order', () => {
    show(three)
    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['Recipes', 'Chicken & leek pie'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/recipes', '/recipes/7'])
  })

  it('the current page is plain text with aria-current="page", never a link', () => {
    show(three)
    const current = screen.getByText('Edit')
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current.closest('a')).toBeNull()
    expect(screen.getAllByRole('link').some((a) => a.textContent === 'Edit')).toBe(false)
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  it('has a Phosphor chevron separator between crumbs only, hidden from assistive technology', () => {
    const { container } = show(three)
    const seps = container.querySelectorAll('.breadcrumbs__sep')
    expect(seps).toHaveLength(2)
    for (const s of seps) {
      expect(s.tagName.toLowerCase()).toBe('svg') // the Icon primitive (icon key "chevron"), not a text glyph
      expect(s).toHaveAttribute('aria-hidden', 'true')
    }
    expect(container.textContent).not.toMatch(/[>›/»]/)
    // the last item has no separator after it
    expect(container.querySelector('li:last-child .breadcrumbs__sep')).toBeNull()
  })

  it('a single crumb is just the current page (no link, no separator)', () => {
    const { container } = show([{ label: 'Settings' }])
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Settings')).toHaveAttribute('aria-current', 'page')
    expect(container.querySelector('.breadcrumbs__sep')).toBeNull()
  })

  it('renders nothing for an empty trail', () => {
    const { container } = show([])
    expect(container.querySelector('nav')).toBeNull()
  })

  it('marks the immediate parent for the phone collapse (second to last), and only it', () => {
    const { container } = show(three)
    const marked = container.querySelectorAll('[data-parent="true"]')
    expect(marked).toHaveLength(1)
    expect(marked[0]).toHaveTextContent('Chicken & leek pie')
    const { container: c2 } = show(two)
    expect(c2.querySelector('[data-parent="true"]')).toHaveTextContent('Settings')
  })

  it('the parent item carries a back caret for the collapsed phone view (decorative, CSS shows it only on phones)', () => {
    const { container } = show(two)
    const caret = container.querySelector('[data-parent="true"] .breadcrumbs__back')
    expect(caret).not.toBeNull()
    expect(caret).toHaveAttribute('aria-hidden', 'true')
  })

  it('the full trail stays in the DOM (collapsing is CSS, so screen readers keep every crumb)', () => {
    show(three)
    for (const label of ['Recipes', 'Chicken & leek pie', 'Edit']) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('never renders the old BackLink markup or a "Back to" name', () => {
    const { container } = show(two)
    expect(container.querySelector('.back-link')).toBeNull()
    expect(screen.queryByRole('link', { name: /^back to/i })).toBeNull()
  })
})
