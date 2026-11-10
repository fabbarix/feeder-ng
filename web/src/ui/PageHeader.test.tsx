import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconButton } from './IconButton'
import { PageHeader } from './PageHeader'
import { declarations, readUiCss } from './test-utils'

describe('PageHeader', () => {
  it('is a banner-less <header> with the title as the h1', () => {
    const { container } = render(<PageHeader title="Recipes" />)
    expect(container.querySelector('header')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Recipes' })).toBeInTheDocument()
  })

  it('shows a subtitle, leading node and actions', () => {
    render(
      <PageHeader
        title="Plan"
        subtitle="Week of 9 November"
        leading={<IconButton icon="back" label="Back" />}
        actions={<IconButton icon="regenerate" label="Re-plan" />}
      />,
    )
    expect(screen.getByText('Week of 9 November')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re-plan' })).toBeInTheDocument()
  })

  it('renders no empty subtitle element', () => {
    const { container } = render(<PageHeader title="Plan" />)
    expect(container.querySelector('.page-header__subtitle')).toBeNull()
  })

  it('uses the title-1 type token', () => {
    const d = declarations(readUiCss('PageHeader.css'), '.page-header__title')
    expect(d['font-size']).toBe('var(--text-title-1-size)')
    expect(d['font-weight']).toBe('var(--text-title-1-weight)')
  })
})
