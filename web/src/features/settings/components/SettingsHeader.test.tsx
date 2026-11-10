// R11a N8: every Settings sub-page leads its h1 with the shared BackLink to /settings.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SettingsHeader } from './SettingsHeader'

describe('SettingsHeader', () => {
  it('has the h1 and the shared back control to Settings', () => {
    const { container } = render(
      <MemoryRouter>
        <SettingsHeader title="Members" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Members' })).toBeInTheDocument()
    const back = screen.getByRole('link', { name: 'Back to Settings' })
    expect(back).toHaveAttribute('href', '/settings')
    expect(back).toHaveClass('back-link')
    expect(container.querySelector('.page-header__leading')).toContainElement(back)
  })
})
