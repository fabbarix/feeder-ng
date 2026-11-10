import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PhotoPicker } from './PhotoPicker'

const props = () => ({ imageUrl: '', uploading: false, error: null as string | null, onFile: vi.fn(), onRemove: vi.fn() })

describe('PhotoPicker', () => {
  it('is a FileDrop zone that accepts images', () => {
    const { container } = render(<PhotoPicker {...props()} />)
    expect(screen.getByTestId('file-drop-zone')).toBeInTheDocument()
    expect(container.querySelector('input[type=file]')).toHaveAttribute('accept', 'image/*')
    expect(screen.getByText('Add photo')).toBeInTheDocument()
  })
  it('hands the chosen photo to onFile', async () => {
    const p = props()
    const { container } = render(<PhotoPicker {...p} />)
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await userEvent.upload(container.querySelector('input[type=file]')!, file)
    expect(p.onFile).toHaveBeenCalledWith(file)
  })
  it('previews the current photo with RecipeThumb, offers Replace and Remove', async () => {
    const p = props()
    const { container } = render(<PhotoPicker {...p} imageUrl="/api/images/abc" />)
    expect(container.querySelector('.recipe-thumb img')).toHaveAttribute('src', '/api/images/abc')
    expect(screen.getByText('Replace photo')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(p.onRemove).toHaveBeenCalledOnce()
  })
  it('shows progress and an upload error', () => {
    const { rerender } = render(<PhotoPicker {...props()} uploading />)
    expect(screen.getByRole('status')).toHaveTextContent('Uploading photo…')
    rerender(<PhotoPicker {...props()} error="A photo must be 8 MB or smaller." />)
    expect(screen.getByText('A photo must be 8 MB or smaller.')).toBeInTheDocument()
  })
  it('reports a file that is not an image as an error, not an upload', async () => {
    const p = props()
    render(<PhotoPicker {...p} />)
    const zone = screen.getByTestId('file-drop-zone')
    const bad = new File(['x'], 'a.txt', { type: 'text/plain' })
    fireEvent.drop(zone, { dataTransfer: { files: [bad] } })
    expect(p.onFile).not.toHaveBeenCalled()
    expect(screen.getByText('That is not a JPEG, PNG, GIF or WebP photo.')).toBeInTheDocument()
  })
})
