// beta.8 (docs/dev/design/b8-base.md section 1): under the take-over ask, a note says how many other lines of the import use the
// Base recipe too after a Yes, only when the server's keptLines is above 0. RED until the note exists.
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../lib/baseRecipes/test-utils'
import { takeOver } from '../fixtures.baseRecipes.test-helper'
import type { ImportTakeOverAsk } from '../types'
import { TakeOverQuestion } from './TakeOverQuestion'

const show = (over: Partial<ImportTakeOverAsk> = {}) => renderWithProviders(<TakeOverQuestion ask={takeOver(over)} onTakeOver={vi.fn()} />)

describe('TakeOverQuestion keptLines note', () => {
  it('says what happens to one other line', () => {
    show({ keptLines: 1 })
    expect(screen.getByText('1 other line in this import stays an Ingredient. With Yes it uses Béchamel too; with No it keeps the Ingredient.')).toBeInTheDocument()
  })

  it('says what happens to several lines, in the plural', () => {
    show({ keptLines: 3 })
    expect(screen.getByText('3 other lines in this import stay an Ingredient. With Yes they use Béchamel too; with No they keep the Ingredient.')).toBeInTheDocument()
  })

  it('shows no note when keptLines is 0', () => {
    show({ keptLines: 0 })
    expect(screen.queryByText(/stays? an Ingredient/)).toBeNull()
  })

  it('shows no note when the server sent no keptLines (an older answer)', () => {
    show({ keptLines: undefined as unknown as number })
    expect(screen.queryByText(/stays? an Ingredient/)).toBeNull()
  })

  it('still shows the note once answered, and when Yes is not offered', () => {
    show({ keptLines: 2, answer: false, resolved: true, convertible: false })
    expect(screen.getByText(/2 other lines in this import stay an Ingredient/)).toBeInTheDocument()
  })

  it('keeps the facts and the question beside the note', () => {
    show({ keptLines: 1 })
    expect(screen.getByText(/An Ingredient named béchamel exists/)).toBeInTheDocument()
    expect(screen.getByText('Should the new Base recipe Béchamel take it over?')).toBeInTheDocument()
  })
})
