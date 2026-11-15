// B9-34: without a `timeZone` prop the sheet reads the Household's zone from /api/me, and only while a tick is being changed (so Scan's
// many screen tests, which have no QueryClient, never call useMe while the sheet is closed).
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { lineEntry } from '../lib/lines'
import { makeGarlic } from '../testData'

const me = vi.hoisted(() => ({ useMe: vi.fn() }))
vi.mock('../../../app/useMe', () => me)

import { TickChangeSheet } from './TickChangeSheet'

const garlic = lineEntry(makeGarlic(), 'USD', 'metric')
const flow = (changing: unknown) => ({ changing: changing as never, change: vi.fn(), closeChange: vi.fn() })

describe('TickChangeSheet: the Household zone', () => {
  it('shows the time of the tick in the zone /api/me gives (Rome is an hour ahead in November)', () => {
    me.useMe.mockReturnValue({ data: { householdTimeZone: 'Europe/Rome' } })
    render(<TickChangeSheet flow={flow({ entry: garlic, added: 500, tickedAt: '2026-11-14T10:12:00Z', clientUuid: 'u-1' })} system="metric" />)
    expect(screen.getByText('Ticked at 11:12')).toBeInTheDocument()
  })

  it('never calls useMe while closed', () => {
    me.useMe.mockReset()
    render(<TickChangeSheet flow={flow(null)} system="metric" />)
    expect(me.useMe).not.toHaveBeenCalled()
  })
})
