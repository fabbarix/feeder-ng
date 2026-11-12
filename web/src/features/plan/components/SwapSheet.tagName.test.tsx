// SF-chips: a relaxed Variety alternative in the Swap sheet names the Tag ("3rd Fish this week"), not its key.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Tag } from '../../../lib/tags'
import { mockApi, newQueryClient, slot } from '../test-utils'
import type { Alternative } from '../types'
import { SwapSheet } from './SwapSheet'

const fish: Tag = { id: 1, name: 'Fish', key: 'fish', colour: 'blue', recipes: 3, slotRules: 0, varietyRule: true }
const alt: Alternative = {
  recipeId: 1, recipeName: 'Fish pie', batches: 1, newLeftoverPortions: 0, newLeftoverUseBy: '', score: 3, relaxed: true,
  why: [{ code: 'variety_relaxed', tag: 'fish', value: 3 }],
}

describe('SwapSheet names the Tag', () => {
  it('says "3rd Fish this week"', async () => {
    mockApi({ 'GET /api/tags': [fish] })
    render(
      <QueryClientProvider client={newQueryClient()}>
        <SwapSheet open onClose={vi.fn()} slot={slot({ date: '2026-11-13' })} alternatives={[alt]} isLoading={false} onPick={vi.fn()} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('3rd Fish this week')).toBeInTheDocument()
  })
})
