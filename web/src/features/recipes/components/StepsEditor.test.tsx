import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StepDraft } from '../lib/draft'
import { StepsEditor } from './StepsEditor'

const step = (over: Partial<StepDraft> = {}): StepDraft => ({
  key: 'k', text: 'Chop', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '', ...over,
})

describe('StepsEditor', () => {
  it('adds an Active Step at the end', async () => {
    const onChange = vi.fn()
    render(<StepsEditor steps={[step()]} errors={{}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add Step' }))
    const next = onChange.mock.calls[0]![0] as StepDraft[]
    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({ kind: 'active', text: '', after: [] })
  })

  it('shows Duration for timeline Steps and Lead time for an Advance Step', () => {
    render(<StepsEditor steps={[step({ kind: 'advance', leadTimeMinutes: '240', durationMinutes: '' }), step({ key: 'j' })]} errors={{}} onChange={() => {}} />)
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]!).getByLabelText('Lead time (min)')).toHaveValue('240')
    expect(within(rows[0]!).queryByLabelText('Duration (min)')).toBeNull()
    expect(within(rows[1]!).getByLabelText('Duration (min)')).toHaveValue('5')
  })

  it('removing a Step remaps the dependencies of the others', async () => {
    const onChange = vi.fn()
    const steps = [step({ key: 'a', text: 'oven' }), step({ key: 'b', text: 'veg' }), step({ key: 'c', text: 'roast', after: [0, 1] })]
    render(<StepsEditor steps={steps} errors={{}} onChange={onChange} />)
    await userEvent.click(within(screen.getAllByRole('listitem')[0]!).getByRole('button', { name: 'Remove Step' }))
    const next = onChange.mock.calls[0]![0] as StepDraft[]
    expect(next.map((s) => s.text)).toEqual(['veg', 'roast'])
    expect(next[1]!.after).toEqual([0])
  })

  it('offers only earlier non-advance Steps in "After"', () => {
    const steps = [step({ key: 'a', kind: 'advance', leadTimeMinutes: '60' }), step({ key: 'b', text: 'veg' }), step({ key: 'c', text: 'roast' })]
    render(<StepsEditor steps={steps} errors={{}} onChange={() => {}} />)
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]!).queryAllByRole('checkbox')).toHaveLength(0)
    expect(within(rows[1]!).queryAllByRole('checkbox')).toHaveLength(0) // only the Advance Step comes before it
    expect(within(rows[2]!).getAllByRole('checkbox')).toHaveLength(1) // veg
  })

  it('shows the message for a Step error', () => {
    render(<StepsEditor steps={[step({ kind: 'passive', durationMinutes: '' })]} errors={{ 'steps.0.durationMinutes': 'passive_needs_duration' }} onChange={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/duration/i)
  })
})
