// R11a N8: one back control for every sub-page (a shared primitive, not an underlined inline link beside the h1).
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import * as ui from '.'
import { BackLink } from './BackLink'
import { declarations, readUiCss } from './test-utils'

const setup = () =>
  render(
    <MemoryRouter>
      <BackLink to="/settings" label="Settings" />
    </MemoryRouter>,
  )

describe('BackLink', () => {
  it('is a link to the destination, announced as "Back to <label>"', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute('href', '/settings')
  })

  it('shows the Phosphor back arrow and the destination name', () => {
    const { container } = setup()
    const link = container.querySelector('a.back-link')
    expect(link).not.toBeNull()
    expect(link?.querySelector('svg')).not.toBeNull()
    expect(link).toHaveTextContent('Settings')
  })

  it('is exported from the ui barrel', () => {
    expect(ui).toHaveProperty('BackLink')
  })

  it('is not underlined, and keeps a 44 px hit area', () => {
    const d = declarations(readUiCss('BackLink.css'), '.back-link')
    expect(d['text-decoration']).toBe('none')
    expect(d['min-block-size']).toBe('44px')
  })
})
