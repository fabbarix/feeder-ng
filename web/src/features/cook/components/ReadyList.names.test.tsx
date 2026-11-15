// B9-45 review (P38-style unique names): an Ingredient in two Courses' Get ready lists names its Course too, so the two ticks differ.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReadySection } from '../lib/ingredients'
import { ReadyList } from './ReadyList'

const row = (key: string, name: string, amount: string) => ({ key, ingredientId: 1, name, amount, place: null, optional: false })
const sections: ReadySection[] = [
  { key: 'main', title: 'Main · Roast chicken', rows: [row('m1', 'Onion', '1'), row('m2', 'Chicken', '1.2 kg')] },
  { key: 'side', title: 'Side · Green beans', rows: [row('s1', 'Onion', '1')] },
]

describe('ReadyList tick names', () => {
  it('a row found in two Courses names its Course; a lone row keeps "<name>, <amount>"', () => {
    render(<ReadyList sections={sections} ticked={new Set()} onToggle={() => {}} />)
    expect(screen.getByRole('checkbox', { name: 'Onion, 1, Main · Roast chicken' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Onion, 1, Side · Green beans' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Chicken, 1.2 kg' })).toBeInTheDocument()
  })
})
