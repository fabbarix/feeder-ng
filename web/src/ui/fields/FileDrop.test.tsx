import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FileDrop } from './FileDrop'

const json = () => new File(['{}'], 'recipe.json', { type: 'application/json' })
const yaml = () => new File(['a: 1'], 'recipe.yaml', { type: 'text/yaml' })

function drop(zone: HTMLElement, files: File[]) {
  const event = createEvent.drop(zone)
  Object.defineProperty(event, 'dataTransfer', { value: { files, types: ['Files'] } })
  fireEvent(zone, event)
}

describe('FileDrop', () => {
  it('shows the prompt, a button to choose, and the chosen file name', () => {
    render(<FileDrop label="Recipe file" fileName="soup.json" onFiles={() => {}} />)
    expect(screen.getByRole('button', { name: /Choose a file or drop it here/ })).toBeInTheDocument()
    expect(screen.getByText('Recipe file')).toBeInTheDocument()
    expect(screen.getByText('soup.json')).toBeInTheDocument()
  })

  it('the button opens the hidden native file input (kept inside the primitive)', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    const { container } = render(<FileDrop label="Recipe file" accept=".json" onFiles={() => {}} />)
    const input = container.querySelector<HTMLInputElement>('input[type=file]')!
    expect(input).toHaveAttribute('accept', '.json')
    await userEvent.click(screen.getByRole('button', { name: /Choose a file/ }))
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })

  it('chosen files reach onFiles', async () => {
    const onFiles = vi.fn()
    const { container } = render(<FileDrop label="Recipe file" accept=".json" onFiles={onFiles} />)
    const file = json()
    await userEvent.upload(container.querySelector<HTMLInputElement>('input[type=file]')!, file)
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('dropped files are filtered by accept: accepted go to onFiles, the rest to onReject', () => {
    const onFiles = vi.fn()
    const onReject = vi.fn()
    render(<FileDrop label="Recipe file" accept=".json" multiple onFiles={onFiles} onReject={onReject} />)
    const zone = screen.getByTestId('file-drop-zone')
    const a = json()
    const b = yaml()
    drop(zone, [a, b])
    expect(onFiles).toHaveBeenCalledWith([a])
    expect(onReject).toHaveBeenCalledWith([b])
  })

  it('without multiple only the first accepted file is used', () => {
    const onFiles = vi.fn()
    render(<FileDrop label="Recipe file" onFiles={onFiles} />)
    const a = json()
    drop(screen.getByTestId('file-drop-zone'), [a, yaml()])
    expect(onFiles).toHaveBeenCalledWith([a])
  })

  it('marks the zone while a drag is over it', () => {
    render(<FileDrop label="Recipe file" onFiles={() => {}} />)
    const zone = screen.getByTestId('file-drop-zone')
    fireEvent.dragEnter(zone)
    expect(zone).toHaveAttribute('data-dragging', 'true')
    fireEvent.dragLeave(zone)
    expect(zone).not.toHaveAttribute('data-dragging', 'true')
  })

  it('shows helper and error, and ignores drops when disabled', () => {
    const onFiles = vi.fn()
    render(<FileDrop label="Recipe file" helper="JSON up to 1 MB" error="Not a recipe file" disabled onFiles={onFiles} />)
    const zone = screen.getByTestId('file-drop-zone')
    expect(screen.getByText('JSON up to 1 MB')).toBeInTheDocument()
    expect(screen.getByText('Not a recipe file')).toBeInTheDocument()
    drop(zone, [json()])
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('passes an aria-describedby to its button, so a host can say why choosing is off', () => {
    const extra = { 'aria-describedby': 'why' } as Record<string, string>
    render(
      <>
        <p id="why">That's 4 photos, the most a read takes.</p>
        <FileDrop label="Photos" disabled onFiles={() => {}} {...extra} />
      </>,
    )
    expect(screen.getByRole('button', { name: /Choose a file/ })).toHaveAccessibleDescription("That's 4 photos, the most a read takes.")
  })
})
