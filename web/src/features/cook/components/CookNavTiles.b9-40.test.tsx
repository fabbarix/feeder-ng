// B9-40 (PC-12, SHORT-01, PC-03): Back and Next carry arrows; the last Step of a meal that is not due yet leaves for the Plan instead of a
// dead Next; a disabled Next always says why.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CookNavTiles, type CookNavTilesProps } from './CookNavTiles'

const base: CookNavTilesProps = { isFirst: false, isLast: false, onBack: () => {}, onNext: () => {} }
const LINE = 'This meal is for tomorrow. Mark it Cooked from Mon 16, on Today or the Plan.'

describe('CookNavTiles arrows (SHORT-01: an arrow above the label in the side columns)', () => {
  it('Back is an outlined secondary with the Back arrow and Next the primary with the Next arrow, both decorative', () => {
    render(<CookNavTiles {...base} />)
    const back = screen.getByRole('button', { name: 'Back' })
    const next = screen.getByRole('button', { name: 'Next' })
    expect(back).toHaveAttribute('data-variant', 'secondary')
    expect(next).toHaveAttribute('data-variant', 'primary')
    for (const b of [back, next]) {
      expect(b.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(b).toHaveClass('cook-nav__tile')
    }
  })
})

describe('Scenario: The last Step of tomorrow\'s meal tells me when I can mark it Cooked (CookNavTiles finishFuture)', () => {
  it('the primary is "Back to Plan" and leaves; there is no Next and no Mark as Cooked', async () => {
    const onLeave = vi.fn()
    render(<CookNavTiles {...base} isLast futureLine={LINE} onLeave={onLeave} />)
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
    const leave = screen.getByRole('button', { name: 'Back to Plan' })
    expect(leave).toBeEnabled()
    expect(leave).toHaveAttribute('data-variant', 'primary')
    await userEvent.click(leave)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })
  it('the line is a status with the Plan\'s calendar icon, and is the button\'s description', () => {
    const { container } = render(<CookNavTiles {...base} isLast futureLine={LINE} onLeave={() => {}} />)
    const line = container.querySelector('.cook-nav__held')!
    expect(line).toHaveAttribute('role', 'status')
    expect(line).toHaveTextContent(LINE)
    expect(line.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: 'Back to Plan' })).toHaveAccessibleDescription(LINE)
  })
  it('the leave label follows the origin when the screen gives one', () => {
    render(<CookNavTiles {...base} isLast futureLine={LINE} onLeave={() => {}} leaveLabel="Back to Today" />)
    expect(screen.getByRole('button', { name: 'Back to Today' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to Plan' })).not.toBeInTheDocument()
  })
  it('before the last Step the future line is not shown (Next is a normal Next)', () => {
    render(<CookNavTiles {...base} futureLine={LINE} onLeave={() => {}} />)
    expect(screen.queryByText(LINE)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })
  it('Back still goes back on that Step', async () => {
    const onBack = vi.fn()
    render(<CookNavTiles {...base} isLast futureLine={LINE} onLeave={() => {}} onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('CookNavTiles never renders a disabled Next without a held line (PC-12 unit test)', () => {
  const cases: [string, Partial<CookNavTilesProps>][] = [
    ['last Step, nothing to offer', { isLast: true }],
    ['last Step, a Planned Meal that may be marked', { isLast: true, onMarkCooked: () => {} }],
    ['last Step, a Recipe', { isLast: true, onDone: () => {} }],
    ['last Step, a future meal', { isLast: true, futureLine: LINE, onLeave: () => {} }],
    ['last Step, a future meal with no way to leave', { isLast: true, futureLine: LINE }],
    ['a middle Step', {}],
    ['a middle Step held by a timer', { heldText: 'Next waits for the oven: 2:43 left. Cancel that timer to go on now.' }],
  ]
  it.each(cases)('%s', (_name, props) => {
    const { container } = render(<CookNavTiles {...base} {...props} />)
    for (const b of screen.queryAllByRole('button', { name: 'Next' })) {
      if ((b as HTMLButtonElement).disabled) {
        const id = b.getAttribute('aria-describedby')
        expect(id, 'a disabled Next names its reason').toBeTruthy()
        expect(container.querySelector(`#${CSS.escape(id!)}`)?.textContent ?? '').not.toBe('')
      }
    }
  })
  it('the last Step with nothing to offer has no forward button at all', () => {
    render(<CookNavTiles {...base} isLast />)
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
  })
})
