import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { icons } from '../icons'
import { ImagePicker } from './ImagePicker'
import { IMAGE_PICKER_ICONS } from './icons'
import { fakeApi, fakeDeps, fakeMedia, ID_A, pngFile, stored } from './testing'

const user = userEvent.setup({ applyAccept: false })

describe('ImagePicker, accessibility', () => {
  it('is a group named by its visible heading, and announces the paste shortcut', () => {
    render(<ImagePicker label="Recipe photo" value="" onChange={() => {}} deps={fakeDeps()} />)
    const group = screen.getByRole('group', { name: 'Recipe photo' })
    expect(group).toHaveAttribute('aria-keyshortcuts', 'Control+V Meta+V')
  })

  it('every button has an accessible name, with or without an image', () => {
    const deps = fakeDeps({ mediaDevices: fakeMedia().media })
    const { rerender } = render(<ImagePicker label="Recipe photo" value="" onChange={() => {}} deps={deps} />)
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAccessibleName()
    rerender(<ImagePicker label="Recipe photo" value={ID_A} onChange={() => {}} deps={deps} />)
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAccessibleName()
  })

  it('the helper describes the group; an error is an alert that also describes it', async () => {
    const { container } = render(<ImagePicker label="Recipe photo" value="" onChange={() => {}} deps={fakeDeps()} />)
    const group = screen.getByRole('group', { name: 'Recipe photo' })
    const helper = screen.getByText(/up to 8 MB/)
    expect(group.getAttribute('aria-describedby')).toContain(helper.id)
    await user.upload(container.querySelector('input[type=file]')!, new File(['x'], 'a.gif', { type: 'image/gif' }))
    const alert = await screen.findByRole('alert')
    expect(group.getAttribute('aria-describedby')).toContain(alert.id)
  })

  it('a host error is shown and wins over the picker\'s own', () => {
    render(<ImagePicker label="Recipe photo" error="Could not save the Recipe." value="" onChange={() => {}} deps={fakeDeps()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the Recipe.')
  })

  it('progress is a polite live region and the group is aria-busy only while working', async () => {
    const api = fakeApi({ uploadDataUrl: vi.fn(() => new Promise<ReturnType<typeof stored>>(() => {})) })
    const { container } = render(<ImagePicker label="Recipe photo" value="" onChange={() => {}} deps={fakeDeps({ api })} />)
    const group = screen.getByRole('group', { name: 'Recipe photo' })
    expect(group).not.toHaveAttribute('aria-busy', 'true')
    await user.upload(container.querySelector('input[type=file]')!, pngFile())
    const status = await screen.findByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(group).toHaveAttribute('aria-busy', 'true')
  })

  it('the preview is an image named after the picker (a decorative thumb would hide the state from screen readers)', () => {
    render(<ImagePicker label="Recipe photo" value={ID_A} onChange={() => {}} deps={fakeDeps()} />)
    expect(screen.getByRole('img', { name: 'Recipe photo' })).toBeInTheDocument()
  })

  it('tabs through the actions in a sensible order: file, Paste image, Paste link', async () => {
    render(<ImagePicker label="Recipe photo" value="" onChange={() => {}} deps={fakeDeps()} />)
    await user.tab()
    expect(screen.getByRole('button', { name: /Choose a file/ })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Paste image' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Paste link' })).toHaveFocus()
  })
})

describe('ImagePicker, icons', () => {
  it('every icon key it uses is in the registry (turns green when the registry gains camera, clipboard, link, rotateLeft, rotateRight)', () => {
    for (const key of IMAGE_PICKER_ICONS) expect(Object.keys(icons), key).toContain(key)
  })
})
