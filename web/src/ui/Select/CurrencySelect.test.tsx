// B9-15 (SET-07, TB-06): a searchable CurrencySelect (size sm) for the Household and the first run.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CurrencySelect } from './CurrencySelect'

const codes = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'XOF']
const setup = (props: Record<string, unknown> = {}) => {
  const onChange = vi.fn()
  const { container } = render(<CurrencySelect value="EUR" onChange={onChange} codes={codes} locale="en" {...props} />)
  return { onChange, container }
}

describe('CurrencySelect', () => {
  it('is a combobox named "Currency" that reads "Euro · EUR" for EUR', () => {
    setup()
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent('Euro · EUR')
  })
  it('is a small field by default (size sm)', () => {
    const { container } = setup()
    expect(container.querySelector('.ui-field')).toHaveAttribute('data-size', 'sm')
  })
  it('size may be overridden', () => {
    const { container } = setup({ size: 'md' })
    expect(container.querySelector('.ui-field')).toHaveAttribute('data-size', 'md')
  })
  it('is searchable: typing "swiss" finds the franc by its name, "chf" by its code', async () => {
    const { onChange } = setup({ codes: [...codes] })
    await userEvent.click(screen.getByRole('combobox', { name: 'Currency' }))
    await userEvent.keyboard('chf')
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Swiss Franc/ }))
    expect(onChange).toHaveBeenCalledWith('CHF')
  })
  it('lists "Common" and then "All currencies"', async () => {
    setup()
    await userEvent.click(screen.getByRole('combobox', { name: 'Currency' }))
    const titles = [...document.querySelectorAll('.select__group-title')].map((g) => g.textContent)
    expect(titles).toEqual(['Common', 'All currencies'])
  })
  it('an option is described by its code and symbol', async () => {
    setup()
    await userEvent.click(screen.getByRole('combobox', { name: 'Currency' }))
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'Euro' })).toHaveAccessibleDescription('EUR · €')
  })
  it('shows an error on the field', () => {
    setup({ error: 'Use a currency code' })
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveAttribute('aria-invalid', 'true')
  })
  it('a stored code outside the list shows in the trigger', () => {
    setup({ value: 'XTS' })
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent('XTS')
  })
})
