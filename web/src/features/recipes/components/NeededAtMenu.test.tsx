import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NeededAtMenu } from './NeededAtMenu'

const steps = [
  { text: 'Marinate', kind: 'advance' as const },
  { text: 'Boil the pasta', kind: 'active' as const },
  { text: 'Layer the lasagne', kind: 'passive' as const },
]

describe('NeededAtMenu: the Needed at chip of a Base recipe line', () => {
  it('reads "Needed at Step 3" for the Step that applies', () => {
    render(<NeededAtMenu steps={steps} value={2} defaultStep={2} lineName="Béchamel" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Needed at Step 3/ })).toBeInTheDocument()
  })
  it('reads "Before you start" for the first Step', () => {
    render(<NeededAtMenu steps={steps} value={1} defaultStep={1} lineName="Béchamel" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Before you start/ })).toBeInTheDocument()
  })
  it('lists the non-Advance Steps with the default marked, and picks one', async () => {
    const onChange = vi.fn()
    render(<NeededAtMenu steps={steps} value={2} defaultStep={2} lineName="Béchamel" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Needed at Step 3/ }))
    expect(screen.queryByText(/Marinate/)).toBeNull()
    expect(screen.getByText('Step 3: Layer the lasagne (default)')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Before you start'))
    expect(onChange).toHaveBeenCalledWith(1)
  })
})
