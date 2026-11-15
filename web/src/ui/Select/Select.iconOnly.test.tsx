// B9-15 (DS-03, decision DS 6): Select `iconOnly` is a chip that cannot show its value. It keeps its icon and chevron, its value is
// visually hidden, and the accessible name and title become "<label>: <value>" (aria-label replaces aria-labelledby). It needs a leading icon.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Select } from './Select'
import { declarations, readUiCss } from '../test-utils'

const css = readUiCss('Select/Select.css')
const options = [
  { value: 'use', label: 'Good until' },
  { value: 'name', label: 'Name' },
]
const chip = (props: Record<string, unknown> = {}) => (
  <Select label="Sort" appearance="chip" icon="sort" options={options} value="use" onChange={() => {}} {...props} />
)

describe('Select iconOnly', () => {
  it('names the trigger "Sort: Good until" with the same title, and drops aria-labelledby', () => {
    render(chip({ iconOnly: true }))
    const trigger = screen.getByRole('combobox', { name: 'Sort: Good until' })
    expect(trigger).toHaveAttribute('aria-label', 'Sort: Good until')
    expect(trigger).toHaveAttribute('title', 'Sort: Good until')
    expect(trigger).not.toHaveAttribute('aria-labelledby')
    expect(trigger).toHaveAttribute('data-icon-only', 'true')
  })
  it('keeps the value text, visually hidden, and the leading icon', () => {
    render(chip({ iconOnly: true }))
    const trigger = screen.getByRole('combobox')
    expect(trigger.querySelector('.select__value')).toHaveClass('visually-hidden')
    expect(trigger.querySelector('.select__value')).toHaveTextContent('Good until')
    expect(trigger.querySelector('.select__leading svg')).toBeInTheDocument()
  })
  it('the name follows the value: after a choice it announces the new sort', async () => {
    const { rerender } = render(chip({ iconOnly: true }))
    rerender(chip({ iconOnly: true, value: 'name' }))
    expect(screen.getByRole('combobox', { name: 'Sort: Name' })).toBeInTheDocument()
  })
  it('stays a combobox: it opens a listbox that ticks the current sort, and picking calls onChange', async () => {
    const onChange = vi.fn()
    render(chip({ iconOnly: true, onChange }))
    await userEvent.click(screen.getByRole('combobox'))
    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByRole('option', { name: 'Good until' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(within(listbox).getByRole('option', { name: 'Name' }))
    expect(onChange).toHaveBeenCalledWith('name')
  })
  it('focus returns to the chip when the listbox closes', async () => {
    render(chip({ iconOnly: true }))
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('combobox')).toHaveFocus()
  })
  it('without iconOnly the name is the label and the value is visible', () => {
    render(chip())
    const trigger = screen.getByRole('combobox', { name: 'Sort' })
    expect(trigger).not.toHaveAttribute('aria-label')
    expect(trigger).not.toHaveAttribute('data-icon-only')
    expect(trigger.querySelector('.select__value')).not.toHaveClass('visually-hidden')
  })
  it('needs a leading icon: without one iconOnly is ignored and the Select keeps its name and value', () => {
    render(chip({ iconOnly: true, icon: undefined }))
    const trigger = screen.getByRole('combobox', { name: 'Sort' })
    expect(trigger).not.toHaveAttribute('data-icon-only')
    expect(trigger).not.toHaveAttribute('aria-label')
  })
  it('an empty Select (no value) icon-only is named by its label alone', () => {
    render(chip({ iconOnly: true, value: null }))
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
  })
  it('the stylesheet shows the leading icon of an icon-only Sort even where the narrow header hides it', () => {
    const lead = declarations(css, ".filter-bar__sort .select__trigger[data-icon-only='true'] .select__leading")
    expect(lead['display']).toBe('inline-grid')
  })
})
