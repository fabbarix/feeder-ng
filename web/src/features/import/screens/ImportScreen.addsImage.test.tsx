// IM3: the review screen shows "Adds a picture to <name>" on the Ingredient rows the server flags.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { match, plan, reviewExtras } from '../fixtures.test-helper'
import type { UseImportReview } from '../hooks/useImportReview'

const hook = vi.hoisted(() => ({ current: {} as UseImportReview }))
vi.mock('../hooks/useImportReview', () => ({ useImportReview: () => hook.current }))
vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
vi.mock('../hooks/useRecipeRead', () => ({
  useRecipeRead: () => ({ phase: 'idle', busy: false, kind: undefined, state: undefined, error: undefined, elapsedSeconds: 0, start: vi.fn(), cancel: vi.fn(), reset: vi.fn() }),
}))
vi.mock('../hooks/useReadAvailability', () => ({
  useReadAvailability: () => ({ loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn() }),
}))

import { ImportScreen } from './ImportScreen'

describe('ImportScreen: adds a picture', () => {
  it('shows the line only on the flagged Ingredient', () => {
    hook.current = {
      phase: 'reviewing', error: undefined, busy: false, stale: false, result: undefined, decisions: { ingredients: [], conversions: [], recipes: [] },
      open: vi.fn(), chooseExisting: vi.fn(), chooseCreate: vi.fn(), answerConversion: vi.fn(), chooseRecipeAction: vi.fn(), confirm: vi.fn(), reset: vi.fn(),
      plan: plan({
        ingredients: [
          match({ key: 'garlic', name: 'garlic', status: 'exact', match: { id: 3, name: 'garlic', baseUnit: 'g' }, effective: { key: 'garlic', action: 'use', ingredientId: 3 }, addsImage: true }),
          match({ key: 'onion', name: 'onion', status: 'exact', match: { id: 4, name: 'onion', baseUnit: 'piece' }, effective: { key: 'onion', action: 'use', ingredientId: 4 } }),
        ],
      }),
      ...reviewExtras(),
    } as UseImportReview
    render(<MemoryRouter><ToastProvider><ImportScreen /></ToastProvider></MemoryRouter>)
    expect(screen.getAllByText(/Adds a picture to/)).toHaveLength(1)
    expect(screen.getByText('Adds a picture to Garlic')).toBeInTheDocument()
  })
})
