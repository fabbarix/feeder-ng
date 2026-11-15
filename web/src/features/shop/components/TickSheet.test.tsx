// B9-34 (SSP-01, replaces the "How much?" sheet tests): the Change sheet "Garlic: how much?" (mocks/ssp-01-tick-change.html). One tap
// ticks now, so the sheet only changes what a tick added: the R-E row of what it added, one radiogroup (the pack, what the Line needed,
// Other amount), Save, and "Tick without adding". Close is the circular outline button; the footer has no Cancel.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TickSheet } from './TickSheet'

const CHOICES = { pack: { label: '1 × Garlic organic pack · 500 g', amount: 500 }, need: { amount: 150 } }

function setup(over: Partial<React.ComponentProps<typeof TickSheet>> = {}) {
  const onSubmit = vi.fn()
  const onClose = vi.fn()
  render(
    <TickSheet open onClose={onClose} name="Garlic" baseUnit="g" system="metric" added={500} tickedAt="2026-11-14T10:12:00Z" timeZone="UTC" choices={CHOICES} onSubmit={onSubmit} {...over} />,
  )
  return { onSubmit, onClose }
}
const dialog = () => screen.getByRole('dialog', { name: 'Garlic: how much?' })
const radios = () => within(screen.getByRole('radiogroup')).getAllByRole('radio')

describe('TickSheet (change): the question and what the tick added', () => {
  it('the title is the one question, "Garlic: how much?"', () => {
    setup()
    expect(dialog()).toBeInTheDocument()
  })

  it('one R-E row: "Added when you ticked it", "+500 g", "Ticked at 10:12"', () => {
    setup()
    const row = within(dialog()).getByText('Added when you ticked it').closest('li')!
    expect(row).toHaveTextContent('+500 g')
    expect(row).toHaveTextContent('Ticked at 10:12')
    expect(row.closest('.detail-list')).not.toBeNull()
  })

  it('a tick that added nothing has no row to show', () => {
    setup({ added: 0 })
    expect(screen.queryByText('Added when you ticked it')).toBeNull()
  })

  it('Close is the circular Close button; there is no Cancel, no native select', () => {
    setup()
    expect(within(dialog()).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(document.querySelector('select')).toBeNull()
  })
})

describe('TickSheet (change): the choices', () => {
  it('one radiogroup: the pack, what the Line needed, Other amount, in that order', () => {
    setup()
    expect(radios().map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['1 × Garlic organic pack · 500 g', 'What the Line needed · 150 g', 'Other amount'])
  })

  it('the choice that matches what was added starts selected, with a roving tabindex', () => {
    setup()
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(radios().map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('an amount that matches the need selects "What the Line needed"; any other amount selects Other with the field filled', () => {
    setup({ added: 150 })
    expect(radios()[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('Other amount opens with the amount and its unit, focused', () => {
    setup({ added: 320 })
    expect(radios()[2]).toHaveAttribute('aria-checked', 'true')
    const field = screen.getByRole('spinbutton', { name: 'How much?' })
    expect(field).toHaveValue('320')
    expect(screen.getByText('g')).toBeInTheDocument()
  })

  it('choosing Other amount reveals the field and moves focus into it', async () => {
    setup()
    expect(screen.queryByRole('spinbutton', { name: 'How much?' })).toBeNull()
    await userEvent.click(radios()[2]!)
    expect(screen.getByRole('spinbutton', { name: 'How much?' })).toHaveFocus()
  })

  it('arrow keys move the choice (radiogroup keyboard)', async () => {
    setup()
    radios()[0]!.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(radios()[1]).toHaveAttribute('aria-checked', 'true')
    expect(radios()[1]).toHaveFocus()
  })

  it('without a known pack there are only two choices', () => {
    setup({ choices: { pack: null, need: { amount: 150 } }, added: 150 })
    expect(radios().map((r) => r.textContent)).toEqual(['What the Line needed · 150 g', 'Other amount'])
  })

  it('the unit label of Other follows the amount (piece / pieces)', async () => {
    setup({ name: 'Onion', baseUnit: 'piece', added: 2, choices: { pack: null, need: { amount: 3 } } })
    await userEvent.click(radios()[1]!)
    const field = screen.getByRole('spinbutton', { name: 'How much?' })
    await userEvent.clear(field)
    await userEvent.type(field, '1')
    await userEvent.tab()
    expect(screen.getByText('piece')).toBeInTheDocument()
  })
})

describe('TickSheet (change): saving', () => {
  it('Save sends the chosen amount: the pack, then what the Line needed', async () => {
    const { onSubmit } = setup({ added: 150 })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenLastCalledWith(150)
    await userEvent.click(radios()[0]!)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenLastCalledWith(500)
  })

  it('Other amount: Save sends what was typed, accepting a decimal comma', async () => {
    const { onSubmit } = setup()
    await userEvent.click(radios()[2]!)
    await userEvent.type(screen.getByRole('spinbutton', { name: 'How much?' }), '1,5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(1.5)
  })

  it('Other amount left empty: an error on the field, nothing is sent', async () => {
    const { onSubmit } = setup()
    await userEvent.click(radios()[2]!)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter an amount')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('"Tick without adding" keeps the tick and takes the Stock back: it sends 0', async () => {
    const { onSubmit } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Tick without adding' }))
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(0)
  })

  it('Save is the primary and "Tick without adding" the outlined secondary of one FormActions row', () => {
    setup()
    expect(dialog().querySelector('.form-actions__primary button')).toHaveAccessibleName('Save')
    expect(dialog().querySelector('.form-actions__secondary button')).toHaveAttribute('data-variant', 'secondary')
  })
})
