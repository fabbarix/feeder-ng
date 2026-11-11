// R2-4 S-02 (Scan part): the live list shows Ingredient names through displayName.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeExtra, makeLine, makeList } from '../../shop/testData'
import { LiveList } from './LiveList'

describe('LiveList names', () => {
  it('capitalises Ingredient names and keeps free text as typed', () => {
    const list = makeList({
      lines: [makeLine({ name: 'basmati rice' })],
      extras: [makeExtra({ text: 'toilet paper' }), makeExtra({ id: 2, text: null, ingredientId: 3, name: 'olive oil', baseUnit: 'ml', quantity: 500 })],
      progress: { ticked: 0, total: 3 },
    })
    render(<LiveList list={list} system="metric" />)
    expect(screen.getByText('Basmati rice')).toBeInTheDocument()
    expect(screen.getByText('Olive oil')).toBeInTheDocument()
    expect(screen.getByText('toilet paper')).toBeInTheDocument()
  })
})
