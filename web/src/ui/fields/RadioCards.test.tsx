// BR-E round 2: RadioCards extended for the Import Review's answer lists: labelledBy, describedBy, no checked value, a mode without
// FieldFrame (`bare`) and manual activation (arrows move the focus; Space, Enter or a click choose). RED until the props exist.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RadioCards } from './RadioCards'

const options = [
  { value: 'a', title: 'Alpha', description: 'First' },
  { value: 'b', title: 'Beta' },
  { value: 'c', title: 'Gamma', disabled: true },
  { value: 'd', title: 'Delta' },
]

describe('RadioCards, as before', () => {
  it('arrows choose and move the focus, skipping disabled options, with one tab stop', async () => {
    const onChange = vi.fn()
    render(<RadioCards label="Pick" options={options} value="a" onChange={onChange} />)
    expect(screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)).toHaveLength(1)
    screen.getByRole('radio', { name: /Alpha/ }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith('b')
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveFocus()
  })
})

describe('RadioCards, no checked value', () => {
  it('accepts null: nothing is checked and the first enabled option is the tab stop', () => {
    render(<RadioCards label="Pick" options={options} value={null} onChange={vi.fn()} />)
    expect(screen.queryByRole('radio', { checked: true })).toBeNull()
    expect(screen.getByRole('radio', { name: /Alpha/ }).tabIndex).toBe(0)
    expect(screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)).toHaveLength(1)
  })

  it('a click on an option still chooses it', async () => {
    const onChange = vi.fn()
    render(<RadioCards label="Pick" options={options} value={null} onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Beta' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })
})

describe('RadioCards, labelledBy and describedBy', () => {
  it('names the group from another element and describes it by others', () => {
    render(
      <>
        <h3 id="q">Is this another recipe?</h3>
        <p id="p1">First problem</p>
        <p id="p2">Second problem</p>
        <RadioCards bare labelledBy="q" describedBy="p1 p2" options={options} value={null} onChange={vi.fn()} />
      </>,
    )
    const group = screen.getByRole('radiogroup', { name: 'Is this another recipe?' })
    expect(group).toHaveAccessibleDescription('First problem Second problem')
  })
})

describe('RadioCards, bare', () => {
  it('has no frame around the group: the radiogroup is the root, and it has one accessible name only', () => {
    const { container } = render(
      <>
        <h3 id="q">Take it over?</h3>
        <div data-testid="host">
          <RadioCards bare labelledBy="q" options={options} value="a" onChange={vi.fn()} />
        </div>
      </>,
    )
    const host = container.querySelector('[data-testid=host]')!
    expect(host.firstElementChild).toHaveAttribute('role', 'radiogroup')
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1)
    expect(screen.getAllByLabelText('Take it over?')).toHaveLength(1)
  })

  it('needs no label', () => {
    render(<RadioCards bare options={options} value="a" onChange={vi.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })
})

describe('RadioCards, manual activation', () => {
  const setup = (value: string | null = 'a') => {
    const onChange = vi.fn()
    render(<RadioCards label="Pick" activation="manual" options={options} value={value} onChange={onChange} />)
    return onChange
  }

  it('arrows move the focus and choose nothing', async () => {
    const onChange = setup()
    screen.getByRole('radio', { name: /Alpha/ }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: 'Delta' })).toHaveFocus() // Gamma is disabled
    await userEvent.keyboard('{ArrowUp}{Home}')
    expect(screen.getByRole('radio', { name: /Alpha/ })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('radio', { name: 'Delta' })).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Space chooses the focused option', async () => {
    const onChange = setup()
    screen.getByRole('radio', { name: /Alpha/ }).focus()
    await userEvent.keyboard('{ArrowDown} ')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('Enter chooses the focused option', async () => {
    const onChange = setup()
    screen.getByRole('radio', { name: /Alpha/ }).focus()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('a click chooses', async () => {
    const onChange = setup()
    await userEvent.click(screen.getByRole('radio', { name: 'Delta' }))
    expect(onChange).toHaveBeenCalledWith('d')
  })

  it('keeps the checked option as the tab stop while the focus roams', async () => {
    setup('a')
    screen.getByRole('radio', { name: /Alpha/ }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: /Alpha/ }).tabIndex).toBe(0)
  })
})
