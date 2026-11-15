// B9-28 (RX-11): the Recipe File tile (it replaces ImportSource). File choosing is our own drop zone around the hidden input.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecipeFileTile } from './RecipeFileTile'

vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
const fileInput = (c: HTMLElement) => c.querySelector('input[type=file]') as HTMLInputElement

describe('RecipeFileTile', () => {
  it('is a tile with the overline Recipe File, the title "Import a Recipe File" and no step number', () => {
    render(<RecipeFileTile busy={false} onSubmit={vi.fn()} />)
    expect(screen.getByText('Recipe File', { selector: '.tile__overline' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Import a Recipe File' })).toBeInTheDocument()
    expect(screen.queryByText(/^Step \d/)).not.toBeInTheDocument()
  })
  it('chooses a file with our own button around the hidden input, and submits its text', async () => {
    const onSubmit = vi.fn()
    const { container } = render(<RecipeFileTile busy={false} onSubmit={onSubmit} />)
    expect(screen.getByTestId('file-drop-zone')).toBeInTheDocument()
    expect(fileInput(container)).toHaveAttribute('accept', '.json,application/json')
    expect(fileInput(container)).toHaveAttribute('hidden')
    await userEvent.upload(fileInput(container), new File(['{"a":1}'], 'soup.feeder.json', { type: 'application/json' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('{"a":1}'))
  })
  it('refuses a file that is not JSON, saying so, without submitting', () => {
    const onSubmit = vi.fn()
    render(<RecipeFileTile busy={false} onSubmit={onSubmit} />)
    fireEvent.drop(screen.getByTestId('file-drop-zone'), { dataTransfer: { files: [new File(['x'], 'soup.png', { type: 'image/png' })] } })
    expect(screen.getByText(/JSON/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it('disables choosing and pasting while busy', () => {
    render(<RecipeFileTile busy onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeDisabled()
  })
  it('keeps Review disabled while the pasted JSON is blank', async () => {
    render(<RecipeFileTile busy={false} onSubmit={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Paste the JSON instead' }))
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled()
  })
})
