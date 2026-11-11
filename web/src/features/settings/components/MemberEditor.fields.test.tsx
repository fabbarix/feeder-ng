// R11a (QA, iPad): the Member sheet's controls are all labelled and explained. The bare "- 1 +" is the Portion Factor
// (functional spec: a default Portion Factor, 0.25..3 in 0.25 steps), so it gets a visible label and a helper line. Avatar is
// an emoji (the API stores at most 4 characters; Member.avatar "🦊"), so it is an EmojiPicker, not a free text field.
// A1 will later add an optional Member email field: the fields live in one stack, nothing here pins the number of fields.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { anna, marco, sam } from './fixtures'
import { MemberEditor } from './MemberEditor'

const users = [{ id: 2, displayName: 'Cook', email: 'cook@example.test' }]
const all = [anna, marco, sam]
const open = (member?: typeof sam, onSave = vi.fn()) => {
  render(<MemberEditor open users={users} members={all} member={member} onSave={onSave} onClose={() => {}} />)
  return onSave
}

describe('MemberEditor: Portion Factor', () => {
  it('has a visible "Portion Factor" label and a helper line, using the GLOSSARY term and none of its _Avoid_ words', () => {
    open()
    const dialog = screen.getByRole('dialog', { name: 'Add Member' })
    expect(within(dialog).getByText('Portion Factor')).toBeVisible()
    const helper = within(dialog).getByText(/standard portion/i)
    expect(helper).toBeVisible()
    expect(helper.textContent).toMatch(/\b1\b/) // says what 1 means (an adult)
    expect(helper.textContent).not.toMatch(/appetite|multiplier|serving size/i)
  })

  it('the stepper is described by that helper (aria-describedby) and still named "Portion Factor"', () => {
    open()
    const helper = screen.getByText(/standard portion/i)
    expect(screen.getByRole('spinbutton', { name: 'Portion Factor' })).toHaveAttribute('aria-describedby', helper.id)
    expect(screen.getByRole('group', { name: 'Portion Factor' })).toHaveAttribute('aria-describedby', helper.id)
  })

  it('sits between Avatar and Linked User, in the order Name, Colour, Avatar, Portion Factor, Linked User', () => {
    open()
    const labels = ['Name', 'Colour', 'Avatar', 'Portion Factor', 'Linked User'].map((t) => screen.getAllByText(new RegExp(`^${t}`))[0]!)
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i - 1]!.compareDocumentPosition(labels[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, labels[i]!.textContent).toBeTruthy()
    }
  })
})

describe('MemberEditor: Avatar', () => {
  it('is a radiogroup named Avatar with a helper (optional, initials by default), not an empty text field', () => {
    open()
    const group = screen.getByRole('radiogroup', { name: 'Avatar' })
    const helper = screen.getByText(/optional/i)
    expect(group).toHaveAttribute('aria-describedby', helper.id)
    expect(helper.textContent).toMatch(/initials/i)
    expect(screen.queryByRole('textbox', { name: /avatar/i })).toBeNull()
    expect(screen.getAllByRole('textbox')).toHaveLength(2) // Name and the optional Email (A1 phase 2); no Avatar text field
  })

  it('a new Member starts on "Initials" and saves an empty avatar', async () => {
    const onSave = open()
    expect(within(screen.getByRole('radiogroup', { name: 'Avatar' })).getByRole('radio', { name: 'Initials' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.type(screen.getByLabelText('Name'), 'Nonna')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave.mock.calls[0]![0]).toMatchObject({ avatar: '' })
  })

  it('picks an emoji and saves it (at most 4 characters, what the API accepts)', async () => {
    const onSave = open()
    await userEvent.type(screen.getByLabelText('Name'), 'Nonna')
    const radios = within(screen.getByRole('radiogroup', { name: 'Avatar' })).getAllByRole('radio')
    expect(radios.length).toBeGreaterThan(6)
    await userEvent.click(radios[1]!) // the first emoji
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    const avatar = onSave.mock.calls[0]![0].avatar as string
    expect([...avatar].length).toBeGreaterThanOrEqual(1)
    expect([...avatar].length).toBeLessThanOrEqual(4)
    expect(avatar).toBe(radios[1]!.textContent)
  })

  it('shows an existing Member\'s emoji as checked and can go back to initials', async () => {
    const onSave = open(sam)
    const group = screen.getByRole('radiogroup', { name: 'Avatar' })
    expect(within(group).getByRole('radio', { name: /fox/i })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(group).getByRole('radio', { name: 'Initials' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave.mock.calls[0]![0]).toMatchObject({ avatar: '' })
  })

  it('every emoji choice has a name for assistive technology (never just the glyph)', () => {
    open()
    for (const r of within(screen.getByRole('radiogroup', { name: 'Avatar' })).getAllByRole('radio')) {
      expect(r.getAttribute('aria-label')?.trim().length ?? 0).toBeGreaterThan(1)
    }
  })
})

describe('MemberEditor: Colour (Custom swatch fix is in place)', () => {
  it('the Custom swatch shows the palette icon and is named "Custom", with no text inside the circle', () => {
    open()
    const custom = within(screen.getByRole('radiogroup', { name: 'Colour' })).getByRole('radio', { name: 'Custom' })
    expect(custom.querySelector('svg')).not.toBeNull()
    expect(custom.textContent).toBe('')
  })
})
