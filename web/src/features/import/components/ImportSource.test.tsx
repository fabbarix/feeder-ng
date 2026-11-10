import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { importStrings as s } from '../strings'
import { ImportSource } from './ImportSource'

const fileInput = (c: HTMLElement) => c.querySelector('input[type=file]') as HTMLInputElement

describe('ImportSource (step 2)', () => {
  it('is a numbered step tile with a FileDrop zone and a styled paste field', () => {
    const { container } = render(<ImportSource busy={false} onSubmit={vi.fn()} />)
    expect(screen.getByText(s.stepOverline(2))).toBeInTheDocument()
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
  it('is disabled while busy', async () => {
    render(<ImportSource busy onSubmit={vi.fn()} />)
    await userEvent.click(screen.getByLabelText(s.pasteLabel))
    await userEvent.paste('{}')
    expect(screen.getByRole('button', { name: s.review })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Choose a file or drop it here' })).toBeDisabled()
  })
})
