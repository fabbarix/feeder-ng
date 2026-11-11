// PE: Select options show the pictures: Members with their Avatar (Photo -> emoji -> initials, colour ring), Ingredients with a Thumb.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ingredientOptions, memberOptions } from './options'

const photo = `/api/images/${'b'.repeat(32)}`
const leading = (o: { leading?: React.ReactNode }) => render(<div data-testid="leading">{o.leading}</div>).getByTestId('leading')

describe('memberOptions: Avatar', () => {
  const [anna, sam, zia] = memberOptions([
    { id: 1, name: 'Anna', photoUrl: photo, avatar: '🙂', colour: '#3366cc' },
    { id: 2, name: 'Sam', avatar: '🦊', colour: '#81b29a' },
    { id: 3, name: 'Zia Rosa' },
  ])

  it('shows the Photo first, with the Member colour ring', () => {
    const el = leading(anna!)
    expect(el.querySelector('img')).toHaveAttribute('src', photo)
    expect(el.querySelector('[data-coloured="true"]')).not.toBeNull()
  })

  it('then the emoji', () => {
    expect(leading(sam!).querySelector('img')).toBeNull()
    expect(screen.getAllByRole('img', { name: 'Sam' })[0]).toHaveTextContent('🦊')
  })

  it('then the initials', () => {
    expect(leading(zia!)).toHaveTextContent('ZR')
  })

  it('a Photo that fails to load falls back to the emoji', () => {
    const el = leading(anna!)
    fireEvent.error(el.querySelector('img')!)
    expect(el.querySelector('img')).toBeNull()
    expect(el).toHaveTextContent('🙂')
  })
})

describe('ingredientOptions: Thumb', () => {
  const [flour, salt] = ingredientOptions([
    { id: 1, name: 'flour', baseUnit: 'g', imageUrl: photo },
    { id: 2, name: 'salt', baseUnit: 'g' },
  ])

  it('an Ingredient with a Picture shows it as a 40 px decorative thumb', () => {
    const t = leading(flour!).querySelector('.thumb')!
    expect(t).toHaveAttribute('data-size', '40')
    expect(t.querySelector('img')).toHaveAttribute('src', photo)
    expect(t.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('one without keeps the empty slot, so the names line up', () => {
    const t = leading(salt!).querySelector('.thumb')!
    expect(t).toHaveAttribute('data-size', '40')
    expect(t.querySelector('img')).toBeNull()
  })

  it('an Ingredient still to be created (key, no id) has a slot too and keeps its value', () => {
    const [draft] = ingredientOptions([{ key: 'new-1', name: 'saffron', baseUnit: 'g' }])
    expect(draft!.value).toBe('new-1')
    expect(leading(draft!).querySelector('.thumb')).not.toBeNull()
  })
})
