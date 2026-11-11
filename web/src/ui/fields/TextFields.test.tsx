import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchField } from './SearchField'
import { TextArea } from './TextArea'
import { TextField } from './TextField'

function Text(props: Partial<React.ComponentProps<typeof TextField>> & { onValue?: (v: string) => void }) {
  const [value, setValue] = useState(props.value ?? '')
  const { onValue, ...rest } = props
  return <TextField label="Name" {...rest} value={value} onChange={(v) => { setValue(v); onValue?.(v) }} />
}

describe('TextField', () => {
  it('has a label, reports every keystroke', async () => {
    const onValue = vi.fn()
    render(<Text onValue={onValue} />)
    await userEvent.type(screen.getByLabelText('Name'), 'Ana')
    expect(onValue).toHaveBeenLastCalledWith('Ana')
    expect(onValue).toHaveBeenCalledTimes(3)
  })
  it('links helper and error with aria-describedby and marks the error invalid', () => {
    render(<Text helper="As on the invite" error="Required" />)
    const input = screen.getByLabelText('Name')
    expect(input).toHaveAccessibleDescription(/As on the invite/)
    expect(input).toHaveAccessibleDescription(/Required/)
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })
  it('passes type, required and disabled through', () => {
    render(<Text type="email" required disabled />)
    const input = screen.getByLabelText(/Name/)
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toBeRequired()
    expect(input).toBeDisabled()
  })
  it('shows a suffix such as a unit', () => {
    render(<Text suffix="min" />)
    expect(screen.getByText('min')).toBeInTheDocument()
  })
  it('announces the suffix: it is part of the accessible description', () => {
    render(<Text suffix="min" />)
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('min')
  })
  it('announces the suffix before the helper text, then any caller-supplied description', () => {
    render(
      <>
        <span id="why">Because</span>
        <Text suffix="min" helper="Time to reheat" aria-describedby="why" />
      </>,
    )
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('min Time to reheat Because')
  })
  it('has no description without a suffix, helper or error', () => {
    render(<Text />)
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-describedby')
  })
})

describe('TextArea', () => {
  it('is a labelled textbox with rows and a description', async () => {
    const onChange = vi.fn()
    render(<TextArea label="Notes" value="" rows={5} helper="Optional" onChange={onChange} />)
    const area = screen.getByRole('textbox', { name: 'Notes' })
    expect(area.tagName).toBe('TEXTAREA')
    expect(area).toHaveAttribute('rows', '5')
    expect(area).toHaveAccessibleDescription('Optional')
    await userEvent.type(area, 'x')
    expect(onChange).toHaveBeenCalledWith('x')
  })
})

describe('SearchField', () => {
  function Search(props: { onSubmit?: (v: string) => void; initial?: string }) {
    const [v, setV] = useState(props.initial ?? '')
    return <SearchField label="Search Recipes" value={v} onChange={setV} onSubmit={props.onSubmit} />
  }
  it('is a searchbox with no clear button while empty', () => {
    render(<Search />)
    expect(screen.getByRole('searchbox', { name: 'Search Recipes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })
  it('the clear button empties the field and refocuses it', async () => {
    render(<Search initial="curry" />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })
  it('Escape clears a non-empty field; Enter submits', async () => {
    const onSubmit = vi.fn()
    render(<Search initial="curry" onSubmit={onSubmit} />)
    screen.getByRole('searchbox').focus()
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('curry')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })
})
