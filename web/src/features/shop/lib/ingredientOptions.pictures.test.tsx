// PE: the Ingredient pickers of the Shopping List and the what-is-this sheet show each Ingredient's Picture (Thumb, empty slot without).
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ingredientPickerOptions } from './ingredientOptions'

const url = `/api/images/${'a'.repeat(32)}`
const leading = (o: { leading?: React.ReactNode }) => render(<div>{o.leading}</div>).container

describe('ingredientPickerOptions: pictures', () => {
  const [flour, salt] = ingredientPickerOptions([
    { id: 1, name: 'flour', baseUnit: 'g', imageUrl: url },
    { id: 2, name: 'salt', baseUnit: 'g' },
  ])

  it('an Ingredient with a Picture leads with a 40 px Thumb of it', () => {
    const el = leading(flour!)
    expect(el.querySelector('.thumb')).toHaveAttribute('data-size', '40')
    expect(el.querySelector('img')).toHaveAttribute('src', url)
  })

  it('one without leads with the empty slot', () => {
    const el = leading(salt!)
    expect(el.querySelector('.thumb')).not.toBeNull()
    expect(el.querySelector('img')).toBeNull()
  })

  it('keeps the name as the label and the Base Unit as meta', () => {
    expect(flour).toMatchObject({ value: 1, label: 'flour' })
    expect(flour!.meta).toBeTruthy()
  })
})
