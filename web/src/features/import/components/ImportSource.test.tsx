import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { importStrings as s } from '../strings'
import { ImportSource } from './ImportSource'

const fileInput = (c: HTMLElement) => c.querySelector('input[type=file]') as HTMLInputElement

describe('ImportSource (step 2)', () => {
  it('is a numbered step tile with a FileDrop zone and a styled paste field', () => {
    const { container } = render(<ImportSource busy={false} onSubmit={vi.fn()} />)
    expect(screen.getByText(s.stepOverline(3))).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: s.stepTwoTitle })).toBeInTheDocument()
    expect(screen.getByTestId('file-drop-zone')).toBeInTheDocument()
    expect(fileInput(container)).toHaveAttribute('accept', '.json,application/json')
    expect(screen.getByRole('textbox', { name: s.pasteLabel }).closest('.ui-field')).not.toBeNull()
  })
  it('submits pasted JSON', async () => {
    const onSubmit = vi.fn()
    render(<ImportSource busy={false} onSubmit={onSubmit} />)
    const review = screen.getByRole('button', { name: s.review })
    expect(review).toBeDisabled()
    await userEvent.click(screen.getByLabelText(s.pasteLabel))
    await userEvent.paste('{"format":"feeder-recipe-file"}')
    expect(review).toBeEnabled()
    await userEvent.click(review)
    expect(onSubmit).toHaveBeenCalledWith('{"format":"feeder-recipe-file"}')
  })
  it('submits the text of a chosen file', async () => {
    const onSubmit = vi.fn()
    const { container } = render(<ImportSource busy={false} onSubmit={onSubmit} />)
    await userEvent.upload(fileInput(container), new File(['{"a":1}'], 'soup.feeder.json', { type: 'application/json' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('{"a":1}'))
  })
  it('refuses a file that is not JSON, saying so, without submitting', async () => {
    const onSubmit = vi.fn()
    const { container } = render(<ImportSource busy={false} onSubmit={onSubmit} />)
    const input = fileInput(container)
    // userEvent.upload honours `accept`; fire the drop path instead.
    fireEvent.drop(screen.getByTestId('file-drop-zone'), { dataTransfer: { files: [new File(['x'], 'soup.png', { type: 'image/png' })] } })
    expect(input).toBeInTheDocument()
    expect(screen.getByText(s.rejectedFile)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it('shows an error, and does not submit or throw, when the file cannot be read', async () => {
    const onSubmit = vi.fn()
    const { container } = render(<ImportSource busy={false} onSubmit={onSubmit} />)
    const read = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>))
    })
    await userEvent.upload(fileInput(container), new File(['{}'], 'soup.feeder.json', { type: 'application/json' }))
    expect(await screen.findByText('The file could not be read.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    read.mockRestore()
  })
  it('clears the read error when the next file is chosen', async () => {
    const onSubmit = vi.fn()
    const { container } = render(<ImportSource busy={false} onSubmit={onSubmit} />)
    const read = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementationOnce(function (this: FileReader) {
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>))
    })
    await userEvent.upload(fileInput(container), new File(['{}'], 'a.json', { type: 'application/json' }))
    await screen.findByText('The file could not be read.')
    read.mockRestore()
    await userEvent.upload(fileInput(container), new File(['{"a":1}'], 'b.json', { type: 'application/json' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('{"a":1}'))
    expect(screen.queryByText('The file could not be read.')).toBeNull()
  })
  it('is disabled while busy', async () => {
    render(<ImportSource busy onSubmit={vi.fn()} />)
    await userEvent.click(screen.getByLabelText(s.pasteLabel))
    await userEvent.paste('{}')
    expect(screen.getByRole('button', { name: s.review })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Choose a file or drop it here' })).toBeDisabled()
  })
})
