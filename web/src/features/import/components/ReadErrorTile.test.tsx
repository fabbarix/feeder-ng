// WP-E/G: the error tile of a failed read: clear copy, Admin and User variants (ai-recipe-import.md sections 1.4, 5.2; ra-e-import.md section 6.2).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ReadErrorInput } from '../lib/readErrors'
import { ReadErrorTile } from './ReadErrorTile'

function setup(error: ReadErrorInput, isAdmin = false) {
  const onRetry = vi.fn()
  const view = render(<MemoryRouter><ReadErrorTile error={error} isAdmin={isAdmin} onRetry={onRetry} /></MemoryRouter>)
  return { onRetry, ...view }
}

describe('ReadErrorTile', () => {
  it('is a danger status tile announced as an alert, with the message', () => {
    const { container } = setup({ code: 'assistant_busy' })
    expect(screen.getByRole('alert')).toHaveTextContent('Anthropic is busy. Try again in a minute.')
    expect(container.querySelector('.tile')).toContainElement(screen.getByRole('alert'))
  })
  it('a retryable error has "Try again", which retries', async () => {
    const { onRetry } = setup({ code: 'assistant_unreachable' })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
  it('an error that the same input cannot fix has no "Try again"', () => {
    setup({ code: 'no_recipe_found' })
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('No recipe was found in this page, text or photo.')
  })
  it('rate limited says when', () => {
    setup({ code: 'assistant_rate_limited', retryAfterSeconds: 45 })
    expect(screen.getByRole('alert')).toHaveTextContent('Too many requests to Anthropic. Try again in 45 s.')
  })

  describe('configuration errors', () => {
    it('Admin: the hint and a link to Settings → Recipe Assistant', () => {
      setup({ code: 'assistant_bad_key' }, true)
      expect(screen.getByRole('alert')).toHaveTextContent("The Recipe Assistant's API key was refused.")
      expect(screen.getByRole('alert')).toHaveTextContent('Replace the key in Settings.')
      expect(screen.getByRole('link', { name: 'Open Recipe Assistant settings' })).toHaveAttribute('href', '/settings/recipe-assistant')
    })
    it('User: "Ask an Admin." and no link', () => {
      setup({ code: 'assistant_bad_key' }, false)
      expect(screen.getByRole('alert')).toHaveTextContent('Ask an Admin.')
      expect(screen.queryByRole('link')).toBeNull()
    })
    it('retired model: the Admin link goes to the model field', () => {
      setup({ code: 'assistant_model_unavailable' }, true)
      expect(screen.getByRole('link', { name: 'Choose another model' })).toHaveAttribute('href', '/settings/recipe-assistant#model')
    })
  })

  describe('refusal (the model declined)', () => {
    it('Admin: names the model, suggests another and links to the model field', () => {
      setup({ code: 'assistant_declined', model: 'Claude Haiku 5.5' }, true)
      expect(screen.getByRole('alert')).toHaveTextContent('Claude Haiku 5.5 declined to read this recipe. Trying another model may work.')
      expect(screen.getByRole('link', { name: 'Choose another model' })).toHaveAttribute('href', '/settings/recipe-assistant#model')
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull() // no automatic retry or fallback
    })
    it('User: names the model and says to ask an Admin to try another one', () => {
      setup({ code: 'assistant_declined', model: 'Claude Haiku 5.5' }, false)
      expect(screen.getByRole('alert')).toHaveTextContent('Claude Haiku 5.5 declined to read this recipe. Trying another model may work.')
      expect(screen.getByRole('alert')).toHaveTextContent('Ask an Admin to try another model.')
      expect(screen.queryByRole('link')).toBeNull()
    })
  })

  it('invalid output lists the failing paths', () => {
    setup({ code: 'assistant_invalid_output', errors: [{ path: '$.recipes[0].steps[2]', message: 'required' }] })
    expect(screen.getByText('$.recipes[0].steps[2]: required')).toBeInTheDocument()
  })
  it('never shows the server message of an unknown code', () => {
    setup({ code: 'brand_new', message: 'secret internal text' })
    expect(screen.queryByText(/secret internal text/)).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('The recipe could not be read. Try again.')
  })
  it('photos not supported by the model: tells an Admin to pick another model', () => {
    setup({ code: 'photos_not_supported_by_model' }, true)
    expect(screen.getByRole('alert')).toHaveTextContent("This model can't read photos.")
    expect(screen.getByRole('link', { name: 'Choose another model' })).toBeInTheDocument()
  })
})
