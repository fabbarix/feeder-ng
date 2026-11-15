// B9-30 (SET-01): the crafted Product Select (ui/Select/ProductSelect.tsx), the Add Shop Barcode sheet's first field.
//   <ProductSelect label?="Product" products: ProductChoice[] shop?: {id,name} value: number|null onChange(id) helper? error? size? />
//   - a combobox named by its label; the trigger shows the chosen Product's name (and its Thumb);
//   - the helper under it names what was chosen: "Sold at Coop · Supply · 40 pieces" ("Sold at Coop · " only for a Product sold there);
//   - the open list is searchable, grouped by productOptions, and has the filter chips "Sold at Coop", and "Food" and "Supplies" when the
//     Products say which they are (`supply` set on at least one);
//   - an empty search says "No Product matches 'xyz'".
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductSelect } from './ProductSelect'
import type { ProductChoice } from './options'

const coop = { id: 1, name: 'Coop' }
const many: ProductChoice[] = Array.from({ length: 13 }, (_, i) => ({ id: i + 1, name: `Product ${String(i + 1).padStart(2, '0')}`, ingredientName: 'Salt', packLabel: '500 g', shopIds: i === 2 ? [1] : [] }))
many.push({ id: 14, name: 'Dishwasher tablets, lemon fresh, 40 pieces', ingredientName: 'Dishwasher tablets', packLabel: '40 pieces', supply: true, shopIds: [1] })

function setup(over: { value?: number | null; onChange?: (id: number) => void; products?: ProductChoice[] } = {}) {
  const onChange = over.onChange ?? vi.fn()
  render(<ProductSelect products={over.products ?? many} shop={coop} value={over.value ?? null} onChange={onChange} />)
  return { onChange }
}
const open = () => userEvent.click(screen.getByRole('combobox', { name: 'Product' }))

describe('ProductSelect', () => {
  it('is a combobox named "Product" (a crafted Select, never a native <select>)', () => {
    setup()
    expect(screen.getByRole('combobox', { name: 'Product' })).toBeInTheDocument()
    expect(document.querySelector('select')).toBeNull()
  })

  it('lists every Product, the 13th included, and picks one', async () => {
    const { onChange } = setup()
    await open()
    await userEvent.type(screen.getByRole('searchbox'), 'Product 13')
    await userEvent.click(await screen.findByRole('option', { name: /Product 13/ }))
    expect(onChange).toHaveBeenCalledWith(13)
  })

  it('groups "Sold at Coop" before "Other Products"', async () => {
    setup()
    await open()
    const listbox = screen.getByRole('listbox')
    const headers = [...listbox.querySelectorAll('[role="presentation"], [role="group"], .select__group, .select__subheader')].map((e) => e.textContent?.trim())
    const sold = headers.findIndex((t) => t?.includes('Sold at Coop'))
    const other = headers.findIndex((t) => t?.includes('Other Products'))
    expect(sold).toBeGreaterThanOrEqual(0)
    expect(other).toBeGreaterThan(sold)
  })

  it('has the "Sold at Coop" filter chip, and Food and Supplies when the Products say which they are', async () => {
    setup()
    await open()
    const tools = document.querySelector<HTMLElement>('.select__tools')!
    for (const name of ['Sold at Coop', 'Food', 'Supplies']) expect(within(tools).getByRole('button', { name })).toBeInTheDocument()
  })

  it('"Supplies" keeps only the Supplies; "Sold at Coop" keeps only what is sold there', async () => {
    setup()
    await open()
    const tools = document.querySelector<HTMLElement>('.select__tools')!
    await userEvent.click(within(tools).getByRole('button', { name: 'Supplies' }))
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await userEvent.click(within(tools).getByRole('button', { name: 'Supplies' }))
    await userEvent.click(within(tools).getByRole('button', { name: 'Sold at Coop' }))
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('without Food/Supply information there is no Food or Supplies chip', async () => {
    setup({ products: many.map(({ supply: _supply, ...rest }) => rest) })
    await open()
    const tools = document.querySelector<HTMLElement>('.select__tools')!
    expect(within(tools).queryByRole('button', { name: 'Food' })).toBeNull()
    expect(within(tools).queryByRole('button', { name: 'Supplies' })).toBeNull()
  })

  it('says what matched nothing: No Product matches \'xyz\'', async () => {
    setup()
    await open()
    await userEvent.type(screen.getByRole('searchbox'), 'xyz')
    expect(await screen.findByText(/No Product matches/)).toHaveTextContent("xyz")
  })

  it('the helper names the chosen Product: "Sold at Coop · Supply · 40 pieces"', () => {
    setup({ value: 14 })
    expect(screen.getByRole('combobox', { name: 'Product' })).toHaveTextContent('Dishwasher tablets, lemon fresh, 40 pieces')
    expect(screen.getByText('Sold at Coop · Supply · 40 pieces')).toBeInTheDocument()
  })

  it('a Product not sold at the Shop has the helper without "Sold at"', () => {
    setup({ value: 1 })
    expect(screen.getByText('Salt · 500 g')).toBeInTheDocument()
  })

  it('shows an error through the field: aria-invalid and the message under it', () => {
    render(<ProductSelect products={many} shop={coop} value={null} onChange={() => {}} error="Choose a Product." />)
    expect(screen.getByRole('combobox', { name: 'Product' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Choose a Product.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
