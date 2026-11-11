import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SecretKeyMissingTile } from './SecretKeyMissingTile'

describe('SecretKeyMissingTile', () => {
  it('explains who sets it and where to read more (approved wording)', () => {
    render(<SecretKeyMissingTile />)
    expect(screen.getByRole('status').textContent).toContain(
      'To turn on the Recipe Assistant, the server needs a secret key (FEEDER_SECRET_KEY). Whoever runs your server sets it once; see the deploy guide.',
    )
  })
  it('shows the deploy guide as plain text until WP-F gives it a page (no dead link)', () => {
    render(<SecretKeyMissingTile />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('see the deploy guide.')
  })
  it('is a warning status, announced', () => {
    render(<SecretKeyMissingTile />)
    expect(screen.getByRole('status')).toHaveTextContent('secret key')
  })
})
