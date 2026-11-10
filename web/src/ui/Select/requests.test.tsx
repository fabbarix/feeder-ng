import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MemberSelect } from './MemberSelect'
import { Select } from './Select'
import { ShopSelect } from './ShopSelect'
import { UnitSelect } from './UnitSelect'

const open = (name: RegExp | string) => userEvent.click(screen.getByRole('combobox', { name }))

describe('WP3b #5: UnitSelect forwards onCreate / createLabel (and is searchable whenever onCreate is given)', () => {
  const units = { baseUnit: 'g', conversions: [{ unit: 'tbsp', toBase: 15 }], globalUnits: ['g', 'ml', 'piece'] }

  it('offers `Use unit "<typed>"` by default for an unknown unit and calls onCreate with it', async () => {
    const onCreate = vi.fn()
    render(<UnitSelect label="Unit" units={units} value={null} onChange={() => {}} onCreate={onCreate} />)
    await open('Unit')
    await userEvent.keyboard('smidgen')
    await userEvent.click(screen.getByRole('option', { name: 'Use unit "smidgen"' }))
    expect(onCreate).toHaveBeenCalledWith('smidgen')
  })

  it('honours a custom createLabel', async () => {
    render(<UnitSelect label="Unit" units={units} value={null} onChange={() => {}} onCreate={() => {}} createLabel={(q) => `Add ${q}`} />)
    await open('Unit')
    await userEvent.keyboard('dash')
    expect(screen.getByRole('option', { name: 'Add dash' })).toBeInTheDocument()
  })

  it('offers no create row without onCreate (unchanged)', async () => {
    render(<UnitSelect label="Unit" units={units} value={null} onChange={() => {}} />)
    await open('Unit')
    await userEvent.keyboard('smidgen')
    expect(screen.queryByRole('option', { name: /Use unit/ })).toBeNull()
  })

  it('does not offer create for a Unit that exists', async () => {
    render(<UnitSelect label="Unit" units={units} value={null} onChange={() => {}} onCreate={() => {}} />)
    await open('Unit')
    await userEvent.keyboard('piece')
    expect(screen.queryByRole('option', { name: 'Use unit "piece"' })).toBeNull()
  })
})

describe('WP3b #7: MemberSelect single', () => {
  const members = [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Ben' },
  ]
  it('picks exactly one Member, closes, and calls onChange with the id (not an array)', async () => {
    const onChange = vi.fn()
    render(<MemberSelect single label="Cook" members={members} value={null} onChange={onChange} />)
    await open('Cook')
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-multiselectable', 'true')
    await userEvent.click(screen.getByRole('option', { name: /Ben/ }))
    expect(onChange).toHaveBeenCalledWith(2)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows the chosen Member in the trigger and marks it selected', async () => {
    render(<MemberSelect single label="Cook" members={members} value={1} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Cook' })).toHaveTextContent('Ada')
    await open('Cook')
    expect(screen.getByRole('option', { name: /Ada/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('without `single` it is still multi-valued (unchanged)', async () => {
    const onChange = vi.fn()
    render(<MemberSelect label="Eating" members={members} values={[1]} onChange={onChange} />)
    await open('Eating')
    await userEvent.click(screen.getByRole('option', { name: /Ben/ }))
    expect(onChange).toHaveBeenCalledWith([1, 2])
  })
})

describe('WP3b #8: clearLabel', () => {
  const shops = [
    { id: 1, name: 'Lidl' },
    { id: 2, name: 'Coop' },
  ]
  const Controlled = ({ onChange }: { onChange?: (v: number | null) => void }) => {
    const [v, setV] = useState<number | null>(2)
    return (
      <ShopSelect
        label="Shop"
        shops={shops}
        value={v}
        clearLabel="Any Shop"
        onChange={(x) => {
          setV(x)
          onChange?.(x)
        }}
      />
    )
  }

  it('lists the clear row first; picking it returns null and the trigger then shows the label', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    await open('Shop')
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Any Shop')
    await userEvent.click(screen.getByRole('option', { name: 'Any Shop' }))
    expect(onChange).toHaveBeenCalledWith(null)
    expect(screen.getByRole('combobox', { name: 'Shop' })).toHaveTextContent('Any Shop')
  })

  it('the clear row is selected while value is null, and a Shop can still be picked after', async () => {
    const onChange = vi.fn()
    render(<ShopSelect label="Shop" shops={shops} value={null} clearLabel="Any Shop" onChange={onChange} />)
    expect(screen.getByRole('combobox', { name: 'Shop' })).toHaveTextContent('Any Shop')
    await open('Shop')
    expect(screen.getByRole('option', { name: 'Any Shop' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('option', { name: /Lidl/ }))
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('plain Select: clearLabel + onClear; onChange is not called for the clear row', async () => {
    const onChange = vi.fn()
    const onClear = vi.fn()
    render(<Select label="Fruit" options={[{ value: 'a', label: 'Apple' }]} value="a" onChange={onChange} clearLabel="Any fruit" onClear={onClear} />)
    await open('Fruit')
    await userEvent.click(screen.getByRole('option', { name: 'Any fruit' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('without clearLabel there is no clear row (unchanged)', async () => {
    render(<ShopSelect label="Shop" shops={shops} value={null} onChange={() => {}} />)
    await open('Shop')
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('searching hides the clear row unless it matches, and it never triggers Create', async () => {
    const onCreate = vi.fn()
    render(<Select label="Fruit" options={[{ value: 'a', label: 'Apple' }]} value={null} onChange={() => {}} clearLabel="Any fruit" onClear={() => {}} onCreate={onCreate} />)
    await open('Fruit')
    await userEvent.keyboard('zzz')
    expect(screen.queryByRole('option', { name: 'Any fruit' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Create "zzz"' })).toBeInTheDocument()
  })
})
