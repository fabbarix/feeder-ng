// WP-E/G: the "Read a recipe" step: three inputs, progress, errors, disabled states (ra-e-import.md section 6.1).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setPages } from '../fakePhotoPages.test-helper'
import type { UseRecipeRead } from '../hooks/useRecipeRead'
import type { ReadAvailability } from '../lib/readAvailability'

vi.mock('../hooks/usePhotoPages', async () => (await import('../fakePhotoPages.test-helper')).fakePhotoPagesModule())

import { ReadRecipeStep } from './ReadRecipeStep'

const idle = (over: Partial<UseRecipeRead> = {}): UseRecipeRead => ({
  phase: 'idle', busy: false, kind: undefined, state: undefined, error: undefined, elapsedSeconds: 0,
  start: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), reset: vi.fn(), ...over,
})
const ready = (over: Partial<ReadAvailability & { retry: () => void }> = {}): ReadAvailability & { retry?: () => void } => ({
  loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, modelName: 'Claude Haiku 5.5', retry: vi.fn(), ...over,
})
const view = (read = idle(), availability = ready()) => {
  const r = render(<MemoryRouter><ReadRecipeStep read={read} availability={availability} /></MemoryRouter>)
  return { read, availability, ...r }
}
const readButton = () => screen.getByRole('button', { name: 'Read recipe' })
const tab = (name: string) => screen.getByRole('radio', { name })

beforeEach(() => {
  setPages()
})

describe('ReadRecipeStep: the three inputs', () => {
  it('is a tile "Read a recipe" with an input choice Web page · Text · Photo, Web page first', () => {
    view()
    expect(screen.getByRole('heading', { name: 'Read a recipe' })).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: 'Read from' })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Web page', 'Text', 'Photo'])
    expect(tab('Web page')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('textbox', { name: 'Page address' })).toHaveAttribute('type', 'url')
  })
  it('uses no native radio, select or file input of its own', () => {
    const { container } = view()
    expect(container.querySelector('input[type=radio], select, input[type=file]')).toBeNull()
  })

  describe('Web page', () => {
    it('Read recipe is off until an address is typed, then starts a url read with the typed text', async () => {
      const { read } = view()
      expect(readButton()).toBeDisabled()
      await userEvent.type(screen.getByRole('textbox', { name: 'Page address' }), 'https://example.com/soup')
      expect(readButton()).toBeEnabled()
      await userEvent.click(readButton())
      expect(read.start).toHaveBeenCalledWith({ kind: 'url', url: 'https://example.com/soup' })
    })
    it('Enter in the address field reads too', async () => {
      const { read } = view()
      await userEvent.type(screen.getByRole('textbox', { name: 'Page address' }), 'https://example.com/soup{Enter}')
      expect(read.start).toHaveBeenCalledOnce()
    })
    it('stays off for blank text', async () => {
      view()
      await userEvent.type(screen.getByRole('textbox', { name: 'Page address' }), '   ')
      expect(readButton()).toBeDisabled()
    })
  })

  describe('Text', () => {
    it('has a Recipe text area and a live count "n / 50,000"', async () => {
      view()
      await userEvent.click(tab('Text'))
      await userEvent.type(screen.getByRole('textbox', { name: 'Recipe text' }), 'Soup')
      expect(screen.getByText('4 / 50,000')).toBeInTheDocument()
    })
    it('starts a text read with the typed text', async () => {
      const { read } = view()
      await userEvent.click(tab('Text'))
      await userEvent.click(screen.getByRole('textbox', { name: 'Recipe text' }))
      await userEvent.paste('Soup: 1 onion')
      await userEvent.click(readButton())
      expect(read.start).toHaveBeenCalledWith({ kind: 'text', text: 'Soup: 1 onion' })
    })
    it('over 50,000 characters: says so and keeps Read off', async () => {
      view()
      await userEvent.click(tab('Text'))
      await userEvent.click(screen.getByRole('textbox', { name: 'Recipe text' }))
      await userEvent.paste('a'.repeat(50_001))
      expect(screen.getByText('That text is over 50,000 characters. Paste a shorter part.')).toBeInTheDocument()
      expect(screen.getByText('50,001 / 50,000')).toBeInTheDocument()
      expect(readButton()).toBeDisabled()
    })
  })

  it('keeps what was typed when the input choice changes and comes back', async () => {
    view()
    await userEvent.type(screen.getByRole('textbox', { name: 'Page address' }), 'https://example.com/soup')
    await userEvent.click(tab('Text'))
    await userEvent.click(tab('Web page'))
    expect(screen.getByRole('textbox', { name: 'Page address' })).toHaveValue('https://example.com/soup')
  })
})

describe('ReadRecipeStep: while a read runs', () => {
  const running = (over: Partial<UseRecipeRead> = {}) => idle({ phase: 'running', busy: true, kind: 'text', state: 'reading', elapsedSeconds: 3, ...over })
  it('shows the progress for the state and Cancel, and disables the inputs and Read', () => {
    view(running())
    expect(screen.getByRole('status')).toHaveTextContent('Reading the recipe…')
    expect(screen.getByRole('textbox', { name: 'Recipe text' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Read recipe' })).toBeNull()
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled()
  })
  it('Cancel cancels the read', async () => {
    const { read } = view(running())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(read.cancel).toHaveBeenCalledOnce()
  })
  it('a photo read shows "Preparing the photos…" and keeps the Photo choice selected, with the pictures still shown disabled', () => {
    view(idle({ phase: 'running', busy: true, kind: 'photo', state: 'preparing' }))
    expect(screen.getByRole('status')).toHaveTextContent('Preparing the photos…')
    expect(tab('Photo')).toHaveAttribute('aria-checked', 'true')
  })
  it('while the POST is in flight (starting) Cancel is not offered yet but the form is locked', () => {
    view(idle({ phase: 'starting', busy: true, kind: 'text', state: undefined }))
    expect(screen.getByRole('textbox', { name: 'Recipe text' })).toBeDisabled()
  })
  it('after 20 s says it is still working', () => {
    view(running({ elapsedSeconds: 31 }))
    expect(screen.getByText('Still working… 31 s')).toBeInTheDocument()
  })
})

describe('ReadRecipeStep: errors', () => {
  it('shows the failure as an alert tile with the mapped copy', () => {
    view(idle({ phase: 'failed', error: { code: 'assistant_busy' } }))
    expect(screen.getByRole('alert')).toHaveTextContent('Anthropic is busy. Try again in a minute.')
  })
  it('Try again sends the same input again', async () => {
    const read = idle()
    const { rerender, availability } = view(read)
    await userEvent.type(screen.getByRole('textbox', { name: 'Page address' }), 'https://example.com/soup')
    await userEvent.click(readButton())
    const failed = idle({ phase: 'failed', error: { code: 'assistant_unreachable' }, start: read.start })
    rerender(<MemoryRouter><ReadRecipeStep read={failed} availability={availability} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(read.start).toHaveBeenCalledTimes(2)
    expect(vi.mocked(read.start).mock.calls[1]![0]).toEqual({ kind: 'url', url: 'https://example.com/soup' })
  })
  it('keeps the input after a failure, and the inputs are usable again', async () => {
    const read = idle()
    const { rerender, availability } = view(read)
    await userEvent.type(screen.getByRole('textbox', { name: 'Page address' }), 'https://example.com/soup')
    rerender(<MemoryRouter><ReadRecipeStep read={idle({ phase: 'failed', error: { code: 'page_unavailable' } })} availability={availability} /></MemoryRouter>)
    expect(screen.getByRole('textbox', { name: 'Page address' })).toHaveValue('https://example.com/soup')
    expect(screen.getByRole('textbox', { name: 'Page address' })).toBeEnabled()
  })
  it('Admin sees the Settings link on a configuration error; a User sees "Ask an Admin."', () => {
    view(idle({ phase: 'failed', error: { code: 'assistant_bad_key' } }), ready({ isAdmin: true }))
    expect(screen.getByRole('link', { name: 'Open Recipe Assistant settings' })).toHaveAttribute('href', '/settings/recipe-assistant')
  })
  it('a User sees "Ask an Admin." on a configuration error', () => {
    view(idle({ phase: 'failed', error: { code: 'assistant_bad_key' } }), ready({ isAdmin: false }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ask an Admin.')
    expect(screen.queryByRole('link')).toBeNull()
  })
  it('editing the input clears the failure', async () => {
    const read = idle({ phase: 'failed', error: { code: 'url_invalid' } })
    view(read)
    await userEvent.type(screen.getByRole('textbox', { name: 'Page address' }), 'h')
    expect(read.reset).toHaveBeenCalled()
  })
})

describe('ReadRecipeStep: disabled states', () => {
  it('while the status loads: inputs disabled, no message', () => {
    view(idle(), ready({ loading: true, enabled: false }))
    expect(screen.getByRole('textbox', { name: 'Page address' })).toBeDisabled()
    expect(readButton()).toBeDisabled()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('Admin: the reason and a link to Settings → Recipe Assistant; inputs and Read disabled', () => {
    view(idle(), ready({ enabled: false, isAdmin: true, settingsLink: true, message: 'The Recipe Assistant is off. Turn it on in Settings.' }))
    expect(screen.getByText('The Recipe Assistant is off. Turn it on in Settings.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Recipe Assistant settings' })).toHaveAttribute('href', '/settings/recipe-assistant')
    expect(screen.getByRole('textbox', { name: 'Page address' })).toBeDisabled()
    expect(readButton()).toBeDisabled()
  })
  it('User: "Ask an Admin" and no link', () => {
    view(idle(), ready({ enabled: false, message: 'The Recipe Assistant is off. Ask an Admin to turn it on.' }))
    expect(screen.getByText('The Recipe Assistant is off. Ask an Admin to turn it on.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(readButton()).toBeDisabled()
  })
  it('the reason is the description of the disabled Read button (screen readers hear why)', () => {
    view(idle(), ready({ enabled: false, message: 'The Recipe Assistant is off. Ask an Admin to turn it on.' }))
    expect(readButton()).toHaveAccessibleDescription('The Recipe Assistant is off. Ask an Admin to turn it on.')
  })
  it('the usual path (Agent Prompt and Recipe File) is still offered: the message does not hide the step', () => {
    view(idle(), ready({ enabled: false, message: 'The Recipe Assistant is off. Ask an Admin to turn it on.' }))
    expect(screen.getByRole('heading', { name: 'Read a recipe' })).toBeInTheDocument()
  })
  it('the status call failed: a message and "Check again", which asks again', async () => {
    const retry = vi.fn()
    view(idle(), ready({ enabled: false, statusFailed: true, message: 'Could not check the Recipe Assistant. Try again.', retry }))
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(retry).toHaveBeenCalledOnce()
  })
  it('Photo alone is unavailable when the model cannot read photos: the choice is disabled and says why; pages and text still work', async () => {
    view(idle(), ready({ photos: false, photosMessage: "This model can't read photos." }))
    expect(tab('Photo')).toBeDisabled()
    expect(screen.getByText("This model can't read photos.")).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Page address' }), 'https://example.com/soup')
    expect(readButton()).toBeEnabled()
  })
  it('household limit used up: Read is disabled with the time to try again', () => {
    const limitMessage = 'Your Household has read 30 recipes in the last hour. Try again in 12 min.'
    view(idle(), ready({ enabled: false, limitMessage, message: limitMessage }))
    expect(screen.getByText(limitMessage)).toBeInTheDocument()
    expect(readButton()).toBeDisabled()
  })
  it('few reads left: the hint is shown and Read still works', async () => {
    view(idle(), ready({ limitHint: '3 reads left this hour.' }))
    expect(screen.getByText('3 reads left this hour.')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Page address' }), 'https://example.com/soup')
    expect(readButton()).toBeEnabled()
  })
})
