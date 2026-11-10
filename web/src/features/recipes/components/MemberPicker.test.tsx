import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemberPicker } from './MemberPicker'

const members = [{ id: 1, name: 'Anna' }, { id: 2, name: 'Ben' }]

describe('MemberPicker', () => {
  it('shows who the preferences are for', () => {
    render(<MemberPicker members={members} selectedId={1} onPick={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Preferences for' })).toHaveTextContent('Anna')
  })
  it('lists the Members and reports the pick', async () => {
    const onPick = vi.fn()
    render(<MemberPicker members={members} selectedId={1} onPick={onPick} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Preferences for' }))
    await userEvent.click(screen.getByRole('option', { name: 'Ben' }))
    expect(onPick).toHaveBeenCalledWith(expect.arrayContaining([2]))
  })
  it('renders nothing without Members', () => {
    const { container } = render(<MemberPicker members={[]} selectedId={null} onPick={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
