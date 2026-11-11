// R11a: PageHeader renders Breadcrumbs on a row of its own ABOVE the h1; it is the only place that renders them.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader'
import { declarations, readUiCss } from './test-utils'

const crumbs = [{ label: 'Settings', to: '/settings' }, { label: 'Meal Slots' }]
const show = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('PageHeader breadcrumbs', () => {
  it('renders the trail before the title in document order, inside the header', () => {
    const { container } = show(<PageHeader title="Meal Slots" breadcrumbs={crumbs} />)
    const header = container.querySelector('header')!
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const h1 = screen.getByRole('heading', { level: 1, name: 'Meal Slots' })
    expect(header).toContainElement(nav)
    expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('puts the trail on its own row: a sibling of the title row, not inside it', () => {
    const { container } = show(<PageHeader title="Meal Slots" breadcrumbs={crumbs} actions={<span>act</span>} />)
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const row = container.querySelector('.page-header__row')
    expect(row).not.toBeNull()
    expect(row).toContainElement(screen.getByRole('heading', { level: 1 }))
    expect(row).toContainElement(screen.getByText('act'))
    expect(row).not.toContainElement(nav)
    expect(container.querySelector('.page-header__crumbs')).toContainElement(nav)
  })

  it('stacks the rows in CSS: the header is a column, the title row keeps the old flex row', () => {
    const css = readUiCss('PageHeader.css')
    expect(declarations(css, '.page-header')['flex-direction']).toBe('column')
    expect(declarations(css, '.page-header__row')['display']).toBe('flex')
    expect(declarations(css, '.page-header__row')['align-items']).toBe('center')
  })

  it('renders no crumbs row without breadcrumbs, or with an empty list', () => {
    const { container, rerender } = show(<PageHeader title="Recipes" />)
    expect(container.querySelector('nav')).toBeNull()
    expect(container.querySelector('.page-header__crumbs')).toBeNull()
    rerender(
      <MemoryRouter>
        <PageHeader title="Recipes" breadcrumbs={[]} />
      </MemoryRouter>,
    )
    expect(container.querySelector('nav')).toBeNull()
  })

  it('works without a Router when there are no breadcrumbs (existing screens and tests)', () => {
    render(<PageHeader title="Plan" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument()
  })
})
