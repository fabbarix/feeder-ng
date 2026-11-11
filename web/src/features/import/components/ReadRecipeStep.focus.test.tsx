// Focus of "Read a recipe": into the progress when a read starts, back to the Read button after Cancel, to the error tile after a failure.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { UseRecipeRead } from '../hooks/useRecipeRead'
import type { ReadAvailability } from '../lib/readAvailability'

vi.mock('../../../ui/ImagePicker/ImagePicker', async () => (await import('../fakeImagePicker.test-helper')).fakeImagePickerModule())

import { ReadRecipeStep } from './ReadRecipeStep'

const idle = (over: Partial<UseRecipeRead> = {}): UseRecipeRead => ({
  phase: 'idle', busy: false, kind: undefined, state: undefined, error: undefined, elapsedSeconds: 0,
  start: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), reset: vi.fn(), ...over,
})
const running = (over: Partial<UseRecipeRead> = {}) => idle({ phase: 'running', busy: true, kind: 'text', state: 'reading', ...over })
const ready: ReadAvailability = { loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true }
const ui = (read: UseRecipeRead) => (
  <MemoryRouter><ReadRecipeStep read={read} availability={ready} /></MemoryRouter>
)

async function typed() {
  const view = render(ui(idle()))
  await userEvent.click(screen.getByRole('radio', { name: 'Text' }))
  await userEvent.click(screen.getByRole('textbox', { name: 'Recipe text' }))
  await userEvent.paste('Soup: 1 onion')
  return view
}

describe('ReadRecipeStep focus', () => {
  it('moves into the progress when a read starts (the Read button is gone)', async () => {
    const { rerender } = await typed()
    screen.getByRole('button', { name: 'Read recipe' }).focus()
    rerender(ui(running()))
    expect(screen.getByRole('group', { name: 'Reading the recipe' })).toHaveFocus()
  })
  it('returns to the Read button after the read is cancelled', async () => {
    const { rerender } = await typed()
    screen.getByRole('button', { name: 'Read recipe' }).focus()
    rerender(ui(running()))
    rerender(ui(idle()))
    expect(screen.getByRole('button', { name: 'Read recipe' })).toHaveFocus()
  })
  it('moves to the error tile after a failure', async () => {
    const { rerender } = await typed()
    screen.getByRole('button', { name: 'Read recipe' }).focus()
    rerender(ui(running()))
    rerender(ui(idle({ phase: 'failed', kind: 'text', error: { code: 'assistant_busy' } })))
    const tile = screen.getByRole('alert').closest('[tabindex="-1"]')
    expect(tile).not.toBeNull()
    expect(tile).toHaveFocus()
  })
  it('does not steal focus when the User has already moved elsewhere', async () => {
    const { rerender } = await typed()
    rerender(ui(running()))
    const other = document.createElement('button')
    document.body.append(other)
    other.focus()
    rerender(ui(idle()))
    expect(other).toHaveFocus()
    other.remove()
  })
  it('does not move focus on first render', () => {
    render(ui(idle()))
    expect(document.body).toHaveFocus()
  })
})
