// B9-34 (SSP-01): TickChangeSheet shows the Change sheet for `flow.changing` (nothing when it is null), words its choices with
// lib/tickAmount tickChoices, hands Save and "Tick without adding" to flow.change, closes through flow.closeChange, and reports a
// failed change to the screen (the sheet stays open for a retry, because the flow keeps its subject).
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { lineEntry } from '../lib/lines'
import { makeGarlic } from '../testData'
import { TickChangeSheet } from './TickChangeSheet'

const garlic = lineEntry(makeGarlic(), 'USD', 'metric')
const target = { entry: garlic, added: 500, tickedAt: '2026-11-14T10:12:00Z', clientUuid: 'u-1' }
const flow = (over = {}) => ({ changing: target, change: vi.fn().mockResolvedValue(undefined), closeChange: vi.fn(), ...over })

describe('TickChangeSheet', () => {
  it('shows nothing while no tick is being changed', () => {
    render(<TickChangeSheet flow={flow({ changing: null })} system="metric" timeZone="UTC" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows "Garlic: how much?" with the pack, what the Line needed and what the tick added', () => {
    render(<TickChangeSheet flow={flow()} system="metric" timeZone="UTC" />)
    const sheet = screen.getByRole('dialog', { name: 'Garlic: how much?' })
    expect(within(sheet).getByRole('radio', { name: '1 × Garlic organic pack · 500 g' })).toBeChecked()
    expect(within(sheet).getByRole('radio', { name: 'What the Line needed · 150 g' })).toBeInTheDocument()
    expect(within(sheet).getByText('+500 g')).toBeInTheDocument()
  })

  it('Save and "Tick without adding" go to flow.change', async () => {
    const f = flow()
    render(<TickChangeSheet flow={f} system="metric" timeZone="UTC" />)
    await userEvent.click(screen.getByRole('radio', { name: /What the Line needed/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(f.change).toHaveBeenLastCalledWith(150)
    await userEvent.click(screen.getByRole('button', { name: 'Tick without adding' }))
    expect(f.change).toHaveBeenLastCalledWith(0)
  })

  it('Close goes to flow.closeChange', async () => {
    const f = flow()
    render(<TickChangeSheet flow={f} system="metric" timeZone="UTC" />)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(f.closeChange).toHaveBeenCalledOnce()
  })

  it('a failed change is reported to the screen, not thrown', async () => {
    const err = new ApiError(500, 'internal', 'boom')
    const onFailed = vi.fn()
    render(<TickChangeSheet flow={flow({ change: vi.fn().mockRejectedValue(err) })} system="metric" timeZone="UTC" onFailed={onFailed} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onFailed).toHaveBeenCalledExactlyOnceWith(err))
  })
})
