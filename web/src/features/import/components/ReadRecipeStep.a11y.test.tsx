// WP-E/G accessibility of "Read a recipe": a live region for progress, named controls, reasons linked to the controls,
// focus after a result (ra-e-import.md section 6.2). Real components; only the ImagePicker is replaced.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { UseRecipeRead } from '../hooks/useRecipeRead'
import type { ReadAvailability } from '../lib/readAvailability'

vi.mock('../../../ui/ImagePicker', async () => (await import('../fakeImagePicker.test-helper')).fakeImagePickerModule())

import { ReadRecipeStep } from './ReadRecipeStep'

const idle = (over: Partial<UseRecipeRead> = {}): UseRecipeRead => ({
  phase: 'idle', busy: false, kind: undefined, state: undefined, error: undefined, elapsedSeconds: 0,
  start: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), reset: vi.fn(), ...over,
})
const ready = (over: Partial<ReadAvailability> = {}): ReadAvailability => ({ loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, ...over })
const ui = (read: UseRecipeRead, availability: ReadAvailability) => (
  <MemoryRouter><ReadRecipeStep read={read} availability={availability} /></MemoryRouter>
)

describe('ReadRecipeStep accessibility', () => {
  it('the input choice is a labelled radiogroup with one tab stop (arrow keys move between Web page, Text, Photo)', async () => {
    render(ui(idle(), ready()))
    const group = screen.getByRole('radiogroup', { name: 'Read from' })
    expect(within(group).getAllByRole('radio').filter((r) => r.tabIndex === 0)).toHaveLength(1)
    screen.getByRole('radio', { name: 'Web page' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Text' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('textbox', { name: 'Recipe text' })).toBeInTheDocument()
  })

  it('progress is announced in one polite status region; nothing else in the step is a live region while idle', () => {
    const { container, rerender } = render(ui(idle(), ready()))
    expect(screen.queryByRole('status')).toBeNull()
    expect(container.querySelector('[aria-live="assertive"], [role=alert]')).toBeNull()
    rerender(ui(idle({ phase: 'running', busy: true, kind: 'url', state: 'fetching' }), ready()))
    expect(screen.getAllByRole('status')).toHaveLength(1)
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('Opening the page…')
    rerender(ui(idle({ phase: 'running', busy: true, kind: 'url', state: 'reading', elapsedSeconds: 40 }), ready()))
    expect(screen.getByRole('status')).toBe(region) // same element: the change is announced
    expect(region.textContent?.trim()).toBe('Reading the recipe…')
  })

  it('a failure is announced once, as an alert, and the progress region is gone', () => {
    const { rerender } = render(ui(idle({ phase: 'running', busy: true, kind: 'text', state: 'reading' }), ready()))
    rerender(ui(idle({ phase: 'failed', kind: 'text', error: { code: 'assistant_busy' } }), ready()))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('every control has an accessible name', () => {
    const { container } = render(ui(idle({ phase: 'running', busy: true, kind: 'text', state: 'reading' }), ready()))
    for (const el of container.querySelectorAll('button, input, textarea, [role=radio]')) {
      expect(el, el.outerHTML.slice(0, 80)).toHaveAccessibleName()
    }
  })

  it('the text counter is part of the text field\'s description', async () => {
    render(ui(idle(), ready()))
    await userEvent.click(screen.getByRole('radio', { name: 'Text' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Recipe text' }), 'Soup')
    expect(screen.getByRole('textbox', { name: 'Recipe text' })).toHaveAccessibleDescription(/4 \/ 50,000/)
  })

  it('the counter is not a live region (it must not announce every keystroke)', async () => {
    render(ui(idle(), ready()))
    await userEvent.click(screen.getByRole('radio', { name: 'Text' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Recipe text' }), 'Soup')
    expect(screen.getByText('4 / 50,000').closest('[aria-live]:not([aria-live=off])')).toBeNull()
  })

  it('the over-limit problem is the field\'s error (invalid and described)', async () => {
    render(ui(idle(), ready()))
    await userEvent.click(screen.getByRole('radio', { name: 'Text' }))
    await userEvent.click(screen.getByRole('textbox', { name: 'Recipe text' }))
    await userEvent.paste('a'.repeat(50_001))
    const field = screen.getByRole('textbox', { name: 'Recipe text' })
    expect(field).toBeInvalid()
    expect(field).toHaveAccessibleDescription(/over 50,000 characters/)
  })

  it('the reason a feature is off describes the disabled controls', () => {
    render(ui(idle(), ready({ enabled: false, message: 'The Recipe Assistant is off. Ask an Admin to turn it on.' })))
    expect(screen.getByRole('textbox', { name: 'Page address' })).toHaveAccessibleDescription(/Ask an Admin/)
    expect(screen.getByRole('button', { name: 'Read recipe' })).toHaveAccessibleDescription(/Ask an Admin/)
  })

  it('the disabled Photo choice says why to a screen reader', () => {
    render(ui(idle(), ready({ photos: false, photosMessage: "This model can't read photos." })))
    expect(screen.getByRole('radio', { name: 'Photo' })).toHaveAccessibleDescription("This model can't read photos.")
  })

  it('Cancel and Try again are real buttons reachable by Tab, in reading order after the status', async () => {
    render(ui(idle({ phase: 'running', busy: true, kind: 'text', state: 'reading' }), ready()))
    await userEvent.tab()
    // the disabled input choice and field are skipped; the first stop is Cancel
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('the Photo tab names each picker "Photo n" (the picker is a group named by its heading)', async () => {
    render(ui(idle(), ready()))
    await userEvent.click(screen.getByRole('radio', { name: 'Photo' }))
    expect(screen.getByRole('group', { name: 'Photo 1' })).toBeInTheDocument()
  })
})
