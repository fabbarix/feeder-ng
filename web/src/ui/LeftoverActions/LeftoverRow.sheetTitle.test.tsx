// B9-14 / DS-01: a Leftover row's Menu sheet is titled with the Recipe name, while its trigger keeps "Actions for <Recipe name>".
// LeftoverRow.tsx is not in B9-14's file list: the one-line change (pass `title={leftover.recipeName}` to Menu) is for the owner of
// ui/LeftoverActions (the main session decides; see the hand-back). This test pins it.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../lib/viewport.test-helper'
import type { Leftover } from '../../lib/leftovers'
import { LeftoverRow } from './LeftoverRow'

afterEach(() => vi.unstubAllGlobals())

const leftover = {
  id: 7,
  recipeId: 3,
  recipeName: 'Cauliflower al gorgonzola with chestnut mushrooms',
  portions: 2,
  useBy: '2026-11-18',
  storagePlaceId: null,
  storagePlaceName: null,
  frozen: false,
  frozenOn: null,
  toAnswer: false,
  plannedPortions: 0,
} as unknown as Leftover

describe('LeftoverRow menu sheet title (DS-01)', () => {
  it('the sheet is titled with the Recipe name and the trigger keeps its "Actions for" name', async () => {
    stubViewportWidth(390)
    render(
      <MemoryRouter>
        <LeftoverRow leftover={leftover} today="2026-11-16" onAction={() => {}} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${leftover.recipeName}` }))
    expect(screen.getByRole('dialog', { name: leftover.recipeName })).toBeInTheDocument()
  })
})
