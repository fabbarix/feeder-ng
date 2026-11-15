// B9-45 (PC-02): ONE info notice for every shortfall of the Cooked meals: a title, DetailList rows (key, state, detail), the foot or
// subline, Correct Stock and Dismiss. Never a danger or spoil tile, never role alert, one row per Ingredient (not one tile).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as plan from '../../plan'
import type { ShortfallGroup } from '../lib/shortfall'
import type { StockWarning } from '../types'
import { ShortfallNotice } from './ShortfallNotice'
import { StockCorrectionSheet } from './StockCorrectionSheet'

const w = (ingredientId: number, name: string, have: number, need: number): StockWarning => ({
  ingredientId, name, baseUnit: 'g', have, need, shortfall: need - have, message: `Stock shows only ${have} g ${name}, the recipe uses ${need} g`,
})
const dinner: ShortfallGroup = {
  id: '2026-11-14/3/1', mealLabel: 'Sat Dinner', recipeName: 'Cauliflower al gorgonzola',
  warnings: [w(1, 'Cauliflower', 0, 800), w(2, 'Gorgonzola', 0, 250), w(3, 'Chestnut mushrooms', 100, 300)],
}
const lunch: ShortfallGroup = { id: '2026-11-15/2/1', mealLabel: 'Sun Lunch', recipeName: 'Chicken curry', warnings: [w(4, 'Rice', 0, 500)] }
const noop = () => {}
const notice = (container: HTMLElement) => container.querySelector<HTMLElement>('.shortfall-notice')!

describe('ShortfallNotice: one tile, one row per Ingredient', () => {
  it('is ONE info status tile with role status, whatever the number of Ingredients: never danger or spoil, never an alert', () => {
    const { container } = render(<ShortfallNotice groups={[dinner]} onCorrect={noop} onDismiss={noop} />)
    expect(container.querySelectorAll('.tile')).toHaveLength(1)
    const tile = notice(container)
    expect(tile).toHaveAttribute('data-variant', 'status')
    expect(tile).toHaveAttribute('data-status', 'info')
    expect(tile).toHaveAttribute('role', 'status')
    expect(container.querySelector('[data-status="danger"], [data-status="spoil"], [role="alert"]')).toBeNull()
  })

  it('titles it "Stock was short for 3 Ingredients" and lists the rows as DetailList rows on the info tone', () => {
    const { container } = render(<ShortfallNotice groups={[dinner]} onCorrect={noop} onDismiss={noop} />)
    expect(within(notice(container)).getByText('Stock was short for 3 Ingredients')).toBeInTheDocument()
    const list = container.querySelector('.detail-list')!
    expect(list).toHaveAttribute('data-tone', 'info')
    const rows = [...list.querySelectorAll('li.detail-row')]
    expect(rows.map((r) => [r.querySelector('.detail-row__label')?.textContent, r.querySelector('.detail-row__state')?.textContent, r.querySelector('.detail-row__detail')?.textContent])).toEqual([
      ['Cauliflower', 'none in Stock', 'The Recipe used 800 g'],
      ['Gorgonzola', 'none in Stock', 'The Recipe used 250 g'],
      ['Chestnut mushrooms', '200 g short', 'The Recipe used 300 g · Stock showed 100 g'],
    ])
  })

  it('reads each row as the Ingredient, its state and its detail ("a list of 3 items")', () => {
    render(<ShortfallNotice groups={[dinner]} onCorrect={noop} onDismiss={noop} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Cauliflower')
    expect(items[0]).toHaveTextContent('none in Stock')
    expect(items[0]).toHaveTextContent('The Recipe used 800 g')
  })

  it('with one short Ingredient the title names it', () => {
    render(<ShortfallNotice groups={[{ ...dinner, warnings: [dinner.warnings[0]!] }]} onCorrect={noop} onDismiss={noop} />)
    expect(screen.getByText('Stock was short for Cauliflower')).toBeInTheDocument()
  })

  it('renders nothing when there is nothing short', () => {
    const { container } = render(<ShortfallNotice groups={[]} onCorrect={noop} onDismiss={noop} />)
    expect(container).toBeEmptyDOMElement()
    const none = render(<ShortfallNotice groups={[{ ...dinner, warnings: [] }]} onCorrect={noop} onDismiss={noop} />)
    expect(none.container).toBeEmptyDOMElement()
  })

  it('writes amounts in the User\'s unit system', () => {
    render(<ShortfallNotice groups={[{ ...dinner, warnings: [dinner.warnings[2]!] }]} system="imperial" onCorrect={noop} onDismiss={noop} />)
    expect(screen.getByText(/The Recipe used 10\.6 oz · Stock showed 3\.5 oz/)).toBeInTheDocument()
  })

  it('has no bullet sentence: the server\'s message text is never shown', () => {
    render(<ShortfallNotice groups={[dinner]} onCorrect={noop} onDismiss={noop} />)
    expect(screen.queryByText(/Stock shows only/)).not.toBeInTheDocument()
  })
})

describe('ShortfallNotice: placement', () => {
  it('in Cook Mode (cooked) the foot says Stock stays where it is, and there is no meal subline', () => {
    const { container } = render(<ShortfallNotice groups={[dinner]} placement="cooked" onCorrect={noop} onDismiss={noop} />)
    expect(container.querySelector('.shortfall-notice__foot')).toHaveTextContent('Stock stays where it is. Correct it if some was left.')
    expect(container.querySelector('.shortfall-notice__subline')).toBeNull()
  })

  it('on Today and the Plan (list) a single meal is named in the subline: "Sat Dinner · Stock stays where it is"', () => {
    const { container } = render(<ShortfallNotice groups={[dinner]} placement="list" onCorrect={noop} onDismiss={noop} />)
    expect(container.querySelector('.shortfall-notice__subline')).toHaveTextContent('Sat Dinner · Stock stays where it is')
    expect(container.querySelector('.shortfall-notice__foot')).toBeNull()
  })

  it('several Cooked meals merge into ONE notice, their rows grouped under a heading per meal', () => {
    const { container } = render(<ShortfallNotice groups={[dinner, lunch]} placement="list" onCorrect={noop} onDismiss={noop} />)
    expect(container.querySelectorAll('.tile')).toHaveLength(1)
    expect(screen.getByText('Stock was short for 4 Ingredients')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Sat Dinner', 'Sun Lunch'])
    expect(container.querySelectorAll('.detail-list')).toHaveLength(2)
    expect(container.querySelector('.shortfall-notice__subline')).toHaveTextContent('Stock stays where it is')
    expect(container.querySelector('.shortfall-notice__subline')).not.toHaveTextContent('Sat Dinner')
  })

  it('names each Recipe in the details when two Recipes are listed ("Chicken curry used 500 g"), without summing', () => {
    render(<ShortfallNotice groups={[dinner, lunch]} placement="list" onCorrect={noop} onDismiss={noop} />)
    expect(screen.getByText('Chicken curry used 500 g')).toBeInTheDocument()
    expect(screen.getByText('Cauliflower al gorgonzola used 800 g')).toBeInTheDocument()
  })

  it('one meal alone has no heading', () => {
    render(<ShortfallNotice groups={[dinner]} placement="list" onCorrect={noop} onDismiss={noop} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

describe('ShortfallNotice: the two buttons', () => {
  it('Correct Stock and Dismiss are secondary (outlined) buttons; Correct Stock opens the one sheet', async () => {
    const onCorrect = vi.fn()
    const onDismiss = vi.fn()
    render(<ShortfallNotice groups={[dinner]} onCorrect={onCorrect} onDismiss={onDismiss} />)
    const correct = screen.getByRole('button', { name: 'Correct Stock' })
    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    expect(correct).toHaveAttribute('data-variant', 'secondary')
    expect(dismiss).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(correct)
    expect(onCorrect).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
    await userEvent.click(dismiss)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('has exactly two buttons, however many rows (one notice, not one set of buttons per Ingredient)', () => {
    render(<ShortfallNotice groups={[dinner, lunch]} onCorrect={noop} onDismiss={noop} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})

describe('the plan feature exports the same notice', () => {
  it('plan/index re-exports the stock feature\'s ShortfallNotice and StockCorrectionSheet (Today and Cook Mode import them from there)', () => {
    expect((plan as Record<string, unknown>).ShortfallNotice).toBe(ShortfallNotice)
    expect((plan as Record<string, unknown>).StockCorrectionSheet).toBe(StockCorrectionSheet)
  })
})
