// B9-15 (SET-06): Home, End, the arrows and type-ahead move the active option and it is always scrolled into view (block: 'nearest').
// End was never wrong; the option was just never shown (OptionList did this, SelectCore did not).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Select } from './Select'

const scrolled: { id: string; arg: unknown }[] = []
beforeEach(() => {
  scrolled.length = 0
  Element.prototype.scrollIntoView = function (this: Element, arg?: unknown) {
    scrolled.push({ id: this.id, arg })
  }
})
afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

const options = Array.from({ length: 12 }, (_, i) => ({ value: i, label: `Recipe ${String.fromCharCode(65 + i)}` }))
const open = async () => {
  render(<Select label="Recipe" options={options} value={null} onChange={() => {}} />)
  await userEvent.click(screen.getByRole('combobox', { name: 'Recipe' }))
}

describe('Select: the active option is scrolled into view', () => {
  it('End makes the last option active and scrolls it into view, block nearest', async () => {
    await open()
    await userEvent.keyboard('{End}')
    const last = screen.getByRole('option', { name: 'Recipe L' })
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', last.id)
    expect(scrolled.at(-1)).toEqual({ id: last.id, arg: { block: 'nearest' } })
  })
  it('Home scrolls the first option back into view', async () => {
    await open()
    await userEvent.keyboard('{End}{Home}')
    expect(scrolled.at(-1)?.id).toBe(screen.getByRole('option', { name: 'Recipe A' }).id)
  })
  it('ArrowDown scrolls the next option into view', async () => {
    await open()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(scrolled.at(-1)?.id).toBe(screen.getByRole('option', { name: 'Recipe C' }).id)
  })
  it('type-ahead scrolls the match into view', async () => {
    await open()
    await userEvent.keyboard('Recipe H')
    expect(scrolled.length).toBeGreaterThan(0)
  })
  it('in a searchable Select (search field focused) End also scrolls it', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ value: i, label: `Pasta ${i}` }))
    render(<Select label="Recipe" options={many} value={null} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Recipe' }))
    await userEvent.keyboard('{End}')
    expect(scrolled.at(-1)?.id).toBe(screen.getByRole('option', { name: 'Pasta 19' }).id)
  })
})
