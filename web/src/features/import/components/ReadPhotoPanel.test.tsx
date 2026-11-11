// WP-G: the Photo tab of "Read a recipe" uses the shared ImagePicker in raw mode (ai-recipe-import.md section 3.5; ra-e-import.md section 6.3).
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lastPickerProps, PICKED, pickerRenders } from '../fakeImagePicker.test-helper'

vi.mock('../../../ui/ImagePicker/ImagePicker', async () => (await import('../fakeImagePicker.test-helper')).fakeImagePickerModule())

import { ReadPhotoPanel } from './ReadPhotoPanel'

const setup = (over: Partial<Parameters<typeof ReadPhotoPanel>[0]> = {}) => {
  const onSlotChange = vi.fn()
  render(<ReadPhotoPanel slots={[null]} onSlotChange={onSlotChange} {...over} />)
  return { onSlotChange }
}

beforeEach(() => {
  pickerRenders.length = 0
})

describe('ReadPhotoPanel', () => {
  it('shows one ImagePicker per slot, labelled "Photo 1", "Photo 2"… in page order', () => {
    setup({ slots: [PICKED, null] })
    const groups = screen.getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Photo 1', 'Photo 2'])
  })
  it('uses the picker in raw mode: data URLs, long edge 2576 px, free crop (no fixed shape for a cookbook page)', () => {
    setup()
    expect(lastPickerProps('Photo 1')).toMatchObject({ mode: 'raw', output: 'dataUrl', maxSide: 2576, aspect: 'free', value: null })
  })
  it('does not set the sources: camera, upload, paste and link all stay (the default)', () => {
    setup()
    expect(lastPickerProps('Photo 1')?.sources).toBeUndefined()
  })
  it('gives each picker its slot as value', () => {
    setup({ slots: [PICKED, null] })
    expect(lastPickerProps('Photo 1')?.value).toBe(PICKED)
    expect(lastPickerProps('Photo 2')?.value).toBeNull()
  })
  it('reports a picked picture with its slot number (0-based)', async () => {
    const { onSlotChange } = setup({ slots: [PICKED, null] })
    await userEvent.click(screen.getByRole('button', { name: 'Choose Photo 2' }))
    expect(onSlotChange).toHaveBeenCalledWith(1, expect.objectContaining({ kind: 'blob' }))
  })
  it('reports a removed picture as null', async () => {
    const { onSlotChange } = setup({ slots: [PICKED, null] })
    await userEvent.click(screen.getByRole('button', { name: 'Remove Photo 1' }))
    expect(onSlotChange).toHaveBeenCalledWith(0, null)
  })
  it('says what to photograph and the limit (helper copy of the plan)', () => {
    setup()
    expect(screen.getByText('A cookbook page or a handwritten card. Up to 4 photos, in page order.')).toBeInTheDocument()
  })
  it('shows the approved privacy note: photos are only kept if you choose to', () => {
    setup()
    expect(screen.getByText('Photos are sent to Anthropic to read the recipe. They are only kept if you choose to use one for the Recipe.')).toBeInTheDocument()
  })
  it('disables every picker when disabled', () => {
    setup({ slots: [PICKED, null], disabled: true })
    expect(lastPickerProps('Photo 1')?.disabled).toBe(true)
    expect(lastPickerProps('Photo 2')?.disabled).toBe(true)
  })
  it('has no error prop: the panel never shows an alert (errors live in the error tile)', () => {
    setup({ slots: [PICKED, null] })
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('puts the helper and the privacy note above the pickers, so they are read before the first picker', () => {
    setup({ slots: [PICKED, null] })
    const help = screen.getByText(/A cookbook page or a handwritten card/)
    const privacy = screen.getByText(/Photos are sent to Anthropic/)
    const first = screen.getAllByRole('group')[0]!
    expect(help.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(privacy.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('uses the full preview size on a wide screen and the 72 px one at phone width (390)', () => {
    setup()
    expect(lastPickerProps('Photo 1')?.size).toBe('hero')
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
    try {
      pickerRenders.length = 0
      cleanup()
      setup()
      expect(lastPickerProps('Photo 1')?.size).toBe(72)
    } finally {
      window.matchMedia = original
    }
  })
  it('has no native file input of its own (the picker owns that)', () => {
    const { container } = render(<ReadPhotoPanel slots={[null]} onSlotChange={vi.fn()} />)
    expect(container.querySelector('input[type=file]')).toBeNull()
  })
})
