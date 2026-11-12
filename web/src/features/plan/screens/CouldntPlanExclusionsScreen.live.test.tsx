// CRS G2 (rx-pt.md section 4.2): the page follows plan changes live. Fixing an Exclusion in another tab empties it.
import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sse = vi.hoisted(() => {
  const handlers: Record<string, () => void> = {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: () => void) => {
      handlers[topic] = handler
      return vi.fn()
    }),
    onReconnect: vi.fn(() => vi.fn()),
    close: vi.fn(),
  }
  return { handlers, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { exclusionCell, sideWeek } from '../couldnt-fixtures'
import { mockApi, renderWithProviders } from '../test-utils'
import { CouldntPlanExclusionsScreen } from './CouldntPlanExclusionsScreen'

beforeEach(() => vi.stubGlobal('EventSource', class {}))
afterEach(() => vi.unstubAllGlobals())

describe('CouldntPlanExclusionsScreen: live', () => {
  it('a `plan` event refetches the cells; once none is held back it shows the empty state', async () => {
    let cells = [exclusionCell('2026-11-13'), exclusionCell('2026-11-14')]
    mockApi({
      'GET /api/plan/couldnt-plan/exclusions': () => ({ cells }),
      'GET /api/plan': { today: '2026-11-10', horizonDays: 7, updating: false, slots: sideWeek(['2026-11-13', '2026-11-14']) },
    })
    renderWithProviders(<CouldntPlanExclusionsScreen />, '/plan/couldnt-plan/excluded')
    expect(await screen.findByRole('heading', { name: "Couldn't plan 2 Sides. Every Recipe is excluded for someone who eats it." })).toBeInTheDocument()
    cells = []
    sse.handlers['plan']?.()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'No Course is held back by Exclusions now.' })).toBeInTheDocument())
    expect(screen.queryByText(/^Couldn't plan 2/)).not.toBeInTheDocument()
  })

  it('a change of Course Attendance (topic household) reaches the page too', async () => {
    mockApi({
      'GET /api/plan/couldnt-plan/exclusions': { cells: [exclusionCell('2026-11-13')] },
      'GET /api/plan': { today: '2026-11-10', horizonDays: 7, updating: false, slots: sideWeek(['2026-11-13']) },
    })
    renderWithProviders(<CouldntPlanExclusionsScreen />, '/plan/couldnt-plan/excluded')
    await screen.findAllByRole('region')
    expect(sse.handlers['household']).toBeTypeOf('function')
  })
})
