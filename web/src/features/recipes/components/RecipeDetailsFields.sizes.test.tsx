// R2-1 (E-01, F-01 adoption): the Details fields have a size each; Yield is a compact stepper; the short fields share a FieldRow.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyDraft } from '../lib/draft'
import { RecipeDetailsFields } from './RecipeDetailsFields'

const view = (over = {}) => {
  const onChange = vi.fn()
  render(<RecipeDetailsFields draft={{ ...emptyDraft(), name: 'Aioli', ...over }} errors={{}} onChange={onChange} />)
  return onChange
}
const frame = (el: HTMLElement) => el.closest('.ui-field') as HTMLElement
const sizeOf = (el: HTMLElement) => frame(el).getAttribute('data-size')

describe('RecipeDetailsFields: sizes', () => {
  it('Name is lg and Description is full width', () => {
    view()
    expect(sizeOf(screen.getByRole('textbox', { name: 'Name' }))).toBe('lg')
    expect(sizeOf(screen.getByRole('textbox', { name: 'Description' }))).toBe('full')
  })
  it('Yield, Cool-down, Leftover Use-by and Reheat time are xs and sit in one FieldRow', () => {
    view()
    const names = ['Yield', 'Cool-down (days)', 'Leftover Use-by (days)', 'Reheat time (minutes)']
    const rows = new Set<Element>()
    for (const name of names) {
      const field = screen.getByRole('spinbutton', { name })
      expect(sizeOf(field), name).toBe('xs')
      rows.add(frame(field).closest('.field-row')!)
    }
    expect(rows.size).toBe(1)
    expect([...rows][0]).not.toBeNull()
  })
  it('Yield is a compact − 4 + stepper; the day and minute fields stay plain digits (blank means "default")', async () => {
    const onChange = view()
    await userEvent.click(screen.getByRole('button', { name: 'Increase Yield' }))
    expect(onChange).toHaveBeenCalledWith({ yield: '5' })
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Yield' }))
    expect(onChange).toHaveBeenCalledWith({ yield: '3' })
    for (const name of ['Cool-down (days)', 'Leftover Use-by (days)', 'Reheat time (minutes)']) {
      expect(screen.queryByRole('button', { name: `Increase ${name}` }), name).toBeNull()
    }
  })
  it('keeps the helper lines (blank uses the household default)', () => {
    view()
    expect(screen.getByText('Blank uses the household default')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Cool-down (days)' })).toHaveAccessibleDescription('Blank uses the household default')
  })
  it('Source link is lg and Attribution is md, side by side in a FieldRow', () => {
    view()
    const link = screen.getByRole('textbox', { name: 'Source link' })
    const attribution = screen.getByRole('textbox', { name: 'Attribution' })
    expect(sizeOf(link)).toBe('lg')
    expect(sizeOf(attribution)).toBe('md')
    expect(frame(link).closest('.field-row')).toBe(frame(attribution).closest('.field-row'))
    expect(frame(link).closest('.field-row')).not.toBeNull()
  })
  it('Ready Meal stays a Checkbox with its hint', () => {
    view()
    expect(screen.getByRole('checkbox', { name: /Ready Meal/ })).toBeInTheDocument()
    expect(screen.getByText('Made from one bought pack')).toBeInTheDocument()
  })
})
