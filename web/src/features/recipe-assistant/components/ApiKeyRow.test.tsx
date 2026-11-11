// ApiKeyRow: renders one of the key states it is given; knows nothing about the API.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiKeyRow } from './ApiKeyRow'

const handlers = () => ({ onChange: vi.fn(), onReplace: vi.fn(), onKeepSaved: vi.fn(), onRemove: vi.fn() })
const base = { last4: '1234', value: '', ...handlers() }

describe('ApiKeyRow saved', () => {
  const state = { mode: 'saved', canKeepSaved: false, required: false, unreadable: false } as const

  it('shows "Key saved", the dots and last four, and the two tertiary buttons', () => {
    render(<ApiKeyRow {...base} state={state} />)
    expect(screen.getByText('Key saved')).toBeInTheDocument()
    expect(screen.getByText('••••1234')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })
  it('has no text input: the key is never shown or editable here', () => {
    const { container } = render(<ApiKeyRow {...base} state={state} />)
    expect(container.querySelector('input')).toBeNull()
  })
  it('Replace and Remove call their handlers', async () => {
    const h = handlers()
    render(<ApiKeyRow {...base} {...h} state={state} />)
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(h.onReplace).toHaveBeenCalledTimes(1)
    expect(h.onRemove).toHaveBeenCalledTimes(1)
  })
  it('disabled disables both buttons', () => {
    render(<ApiKeyRow {...base} state={state} disabled />)
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })
})

describe('ApiKeyRow entry', () => {
  const entry = { mode: 'entry', canKeepSaved: false, required: false, unreadable: false } as const

  it('is a password field named "API key" that is not autofilled or spell-checked', () => {
    render(<ApiKeyRow {...base} state={entry} />)
    const input = screen.getByLabelText('API key')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveAttribute('spellcheck', 'false')
  })
  it('helper: "Saved encrypted. Feeder never shows it again."', () => {
    render(<ApiKeyRow {...base} state={entry} />)
    expect(screen.getByLabelText('API key')).toHaveAccessibleDescription('Saved encrypted. Feeder never shows it again.')
  })
  it('typing calls onChange with the text', async () => {
    const h = handlers()
    render(<ApiKeyRow {...base} {...h} state={entry} />)
    await userEvent.type(screen.getByLabelText('API key'), 'sk-1')
    expect(h.onChange).toHaveBeenLastCalledWith('1')
  })
  it('has no Replace or Remove buttons', () => {
    render(<ApiKeyRow {...base} state={entry} />)
    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })
  it('"Keep saved key" appears only when canKeepSaved, and calls onKeepSaved', async () => {
    const h = handlers()
    const { rerender } = render(<ApiKeyRow {...base} {...h} state={entry} />)
    expect(screen.queryByRole('button', { name: 'Keep saved key' })).toBeNull()
    rerender(<ApiKeyRow {...base} {...h} state={{ ...entry, canKeepSaved: true }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Keep saved key' }))
    expect(h.onKeepSaved).toHaveBeenCalledTimes(1)
  })
  it('required (new address): helper "A new address needs the key typed again." and the field is required', () => {
    render(<ApiKeyRow {...base} state={{ ...entry, required: true }} />)
    const input = screen.getByLabelText(/API key/)
    expect(input).toBeRequired()
    expect(input).toHaveAccessibleDescription(expect.stringContaining('A new address needs the key typed again.'))
  })
  it('unreadable: says why, in text', () => {
    render(<ApiKeyRow {...base} state={{ ...entry, unreadable: true }} />)
    expect(screen.getByText("The saved API key can't be read with this server's secret key. Enter it again.")).toBeInTheDocument()
  })
  it('an error marks the input invalid and is its description', () => {
    render(<ApiKeyRow {...base} state={entry} error="Anthropic refused this API key." />)
    const input = screen.getByLabelText('API key')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(expect.stringContaining('Anthropic refused this API key.'))
  })
  it('disabled disables the input', () => {
    render(<ApiKeyRow {...base} state={entry} disabled />)
    expect(screen.getByLabelText('API key')).toBeDisabled()
  })
})
