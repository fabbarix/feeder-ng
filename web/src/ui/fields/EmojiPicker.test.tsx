// R11a: EmojiPicker primitive (web/src/ui/fields/EmojiPicker.tsx), the Member Avatar control: a radiogroup of emoji
// choices plus a "none" choice (initials), same pattern as ColorSwatches. No native control, no free text.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmojiPicker } from './EmojiPicker'

const options = [{ value: '🦊', name: 'Fox' }, { value: '🐻', name: 'Bear' }, { value: '🌻', name: 'Sunflower' }]
const props = { label: 'Avatar', helper: 'Pick an emoji, or keep the initials.', noneLabel: 'Initials', options }

describe('EmojiPicker', () => {
  it('is a radiogroup named by its visible label, with a helper line it is described by', () => {
    render(<EmojiPicker {...props} value="" onChange={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: 'Avatar' })
    const helper = screen.getByText('Pick an emoji, or keep the initials.')
    expect(group).toHaveAttribute('aria-describedby', helper.id)
  })

  it('offers "none" first, then each emoji by name; the current value is checked', () => {
    render(<EmojiPicker {...props} value="🐻" onChange={() => {}} />)
    const radios = within(screen.getByRole('radiogroup')).getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Initials', 'Fox', 'Bear', 'Sunflower'])
    expect(screen.getByRole('radio', { name: 'Bear' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Fox' })).toHaveAttribute('aria-checked', 'false')
  })

  it('without a noneLabel there is no "none" choice (the host offers Initials elsewhere)', () => {
    render(<EmojiPicker label="Emoji" options={options} value="🐻" onChange={() => {}} />)
    const radios = within(screen.getByRole('radiogroup')).getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Fox', 'Bear', 'Sunflower'])
  })

  it('the empty value checks the none choice', () => {
    render(<EmojiPicker {...props} value="" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Initials' })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows the emoji as the glyph of its radio (the name is the aria-label)', () => {
    render(<EmojiPicker {...props} value="" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Fox' })).toHaveTextContent('🦊')
  })

  it('click and arrow keys choose; choosing none gives the empty string', async () => {
    const onChange = vi.fn()
    render(<EmojiPicker {...props} value="🦊" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Sunflower' }))
    expect(onChange).toHaveBeenLastCalledWith('🌻')
    await userEvent.click(screen.getByRole('radio', { name: 'Initials' }))
    expect(onChange).toHaveBeenLastCalledWith('')
    screen.getByRole('radio', { name: 'Fox' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('🐻')
  })

  it('a stored value that is not in the list stays visible and checked (an existing Member is never silently changed)', () => {
    render(<EmojiPicker {...props} value="AB" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'AB' })).toHaveAttribute('aria-checked', 'true')
  })

  it('uses roving focus: one tab stop in the group', () => {
    render(<EmojiPicker {...props} value="🦊" onChange={() => {}} />)
    const stops = screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)
    expect(stops).toHaveLength(1)
    expect(stops[0]).toHaveAccessibleName('Fox')
  })

  it('has no native input or select', () => {
    const { container } = render(<EmojiPicker {...props} value="" onChange={() => {}} />)
    expect(container.querySelector('input, select, textarea')).toBeNull()
  })
})
