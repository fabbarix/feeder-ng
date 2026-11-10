// R11a: every Settings sub-page leads with Breadcrumbs (Settings > page) above its h1, not a back link.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SettingsHeader } from './SettingsHeader'

describe('SettingsHeader', () => {
  it('has the h1 and the Breadcrumbs trail Settings > Members above it', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/settings/members']}>
        <SettingsHeader title="Members" />
      </MemoryRouter>,
    )
    const h1 = screen.getByRole('heading', { level: 1, name: 'Members' })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.querySelector('a[href="/settings"]')).toHaveTextContent('Settings')
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Members')
    expect(container.querySelector('.page-header')).toContainElement(nav)
    expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no back link and no leading slot', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/settings/members']}>
        <SettingsHeader title="Members" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: /^back to/i })).toBeNull()
    expect(container.querySelector('.back-link, .page-header__leading')).toBeNull()
  })
})
