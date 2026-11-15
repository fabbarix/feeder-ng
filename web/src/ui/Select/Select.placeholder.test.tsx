// B9-15 (SAFE, "an empty Select shows a muted placeholder"): Add to Shopping List shows "Choose an Ingredient" while nothing is chosen.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Select } from './Select'

const options = [{ value: 1, label: 'Flour' }]

describe('Select placeholder', () => {
  it('an empty Select shows the placeholder and marks the trigger data-placeholder', () => {
    render(<Select label="Ingredient" placeholder="Choose an Ingredient" options={options} value={null} onChange={() => {}} />)
    const trigger = screen.getByRole('combobox', { name: 'Ingredient' })
    expect(trigger).toHaveTextContent('Choose an Ingredient')
    expect(trigger).toHaveAttribute('data-placeholder')
  })
  it('a chosen value replaces it and the marker goes', () => {
    render(<Select label="Ingredient" placeholder="Choose an Ingredient" options={options} value={1} onChange={() => {}} />)
    const trigger = screen.getByRole('combobox', { name: 'Ingredient' })
    expect(trigger).toHaveTextContent(/^Flour$/)
    expect(trigger).not.toHaveAttribute('data-placeholder')
  })
  it('the placeholder is not an option and not part of the accessible name', () => {
    render(<Select label="Ingredient" placeholder="Choose an Ingredient" options={options} value={null} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Ingredient' })).toBeInTheDocument()
  })
})

describe('Select trigger anatomy', () => {
  it('the leading visual (an icon, or the option\'s Thumb with its monogram letter) is hidden from assistive technology, so the value reads "Flour", not "FFlour"', () => {
    const withThumb = [{ value: 1, label: 'Flour', leading: <span className="thumb">F</span> }]
    const { unmount } = render(<Select label="Ingredient" options={withThumb} value={1} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Ingredient' }).querySelector('.select__leading')).toHaveAttribute('aria-hidden', 'true')
    unmount()
    render(<Select label="Shop for" appearance="chip" icon="plan" options={options} value={1} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Shop for' }).querySelector('.select__leading')).toHaveAttribute('aria-hidden', 'true')
  })
})
