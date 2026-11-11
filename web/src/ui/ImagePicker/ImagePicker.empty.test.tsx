import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ImagePicker } from './ImagePicker'
import { fakeDeps, fakeMedia } from './testing'

const noop = () => {}
const group = () => screen.getByRole('group', { name: 'Recipe photo' })

describe('ImagePicker, empty', () => {
  it('is a labelled group with the heading, the limit helper and the styled file drop', () => {
    render(<ImagePicker label="Recipe photo" value="" onChange={noop} deps={fakeDeps()} />)
    expect(group()).toBeInTheDocument()
    expect(screen.getByText('Recipe photo')).toBeInTheDocument()
    expect(screen.getByText(/JPEG, PNG or WebP, up to 8 MB/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choose a file or drop it here/ })).toBeInTheDocument()
    expect(screen.getByTestId('file-drop-zone')).toBeInTheDocument()
  })

  it('offers Paste image and Paste link, and no preview, rotate or remove', () => {
    render(<ImagePicker label="Recipe photo" value="" onChange={noop} deps={fakeDeps()} />)
    expect(screen.getByRole('button', { name: 'Paste image' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paste link' })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    for (const name of ['Rotate left', 'Rotate right', 'Remove image']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })

  it('shows Take photo only where a camera route exists (here: getUserMedia)', () => {
    const { unmount } = render(<ImagePicker label="Recipe photo" value="" onChange={noop} deps={fakeDeps()} />)
    expect(screen.queryByRole('button', { name: 'Take photo' })).not.toBeInTheDocument()
    unmount()
    render(<ImagePicker label="Recipe photo" value="" onChange={noop} deps={fakeDeps({ mediaDevices: fakeMedia().media })} />)
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument()
  })

  it('the host helper replaces the default one', () => {
    render(<ImagePicker label="Recipe photo" helper="Shown on the Recipe tile." value="" onChange={noop} deps={fakeDeps()} />)
    expect(screen.getByText('Shown on the Recipe tile.')).toBeInTheDocument()
    expect(screen.queryByText(/up to 8 MB/)).not.toBeInTheDocument()
  })

  it('`sources` limits the buttons', () => {
    render(<ImagePicker label="Recipe photo" value="" onChange={noop} sources={['file']} deps={fakeDeps({ mediaDevices: fakeMedia().media })} />)
    expect(screen.getByRole('button', { name: /Choose a file/ })).toBeInTheDocument()
    for (const name of ['Paste image', 'Paste link', 'Take photo']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })

  it('without the file source there is no file drop', () => {
    render(<ImagePicker label="Recipe photo" value="" onChange={noop} sources={['link']} deps={fakeDeps()} />)
    expect(screen.queryByTestId('file-drop-zone')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paste link' })).toBeInTheDocument()
  })

  it('never shows a native file input: every one is hidden inside the primitive', () => {
    const { container } = render(<ImagePicker label="Recipe photo" value="" onChange={noop} deps={fakeDeps({ mediaDevices: fakeMedia().media })} />)
    const inputs = container.querySelectorAll('input[type=file]')
    expect(inputs.length).toBeGreaterThan(0)
    inputs.forEach((i) => expect(i).toHaveAttribute('hidden'))
    expect(container.querySelector('input:not([hidden])')).toBeNull()
  })

  // TODO(heic): with HEIC on, accept is 'image/jpeg,image/png,image/webp' again.
  it('accepts only JPEG, PNG and WebP (HEIC is refused for now)', () => {
    const { container } = render(<ImagePicker label="Recipe photo" value="" onChange={noop} deps={fakeDeps()} />)
    expect(container.querySelector('input[type=file]')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  })

  it('disabled disables every action', () => {
    render(<ImagePicker label="Recipe photo" value="" onChange={noop} disabled deps={fakeDeps({ mediaDevices: fakeMedia().media })} />)
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
  })
})

describe('ImagePicker, hideLabel', () => {
  it('keeps the group named by the label but marks the visible heading as visually hidden', () => {
    render(<ImagePicker label="Picture" hideLabel value="" onChange={noop} deps={fakeDeps()} />)
    expect(screen.getByRole('group', { name: 'Picture' })).toBeInTheDocument()
    expect(screen.getByText('Picture')).toHaveClass('image-picker__heading--hidden')
  })
  it('shows the heading by default', () => {
    render(<ImagePicker label="Picture" value="" onChange={noop} deps={fakeDeps()} />)
    expect(screen.getByText('Picture')).not.toHaveClass('image-picker__heading--hidden')
  })
})
