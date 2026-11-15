// B9-34 (A11Y-07, SSP-01): focus after a row leaves its list. A tick moves the row to Ticked, a Not needed moves it out: focus goes to
// the next row's tick in the same list, else the previous row's, else a heading (never <body>). The lists are ListGroups that keep focus
// through useFocusKeeper (ui/lib), each row marked data-focus-key by LineRow.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeLine, makeList, makeTick } from '../testData'
import { ShoppingBody } from './ShoppingBody'

const base = { system: 'metric' as const, shopName: 'Coop', onTick: () => {}, onUntick: () => {}, onOpenLine: () => {}, onScan: () => {} }
const line = (id: number, name: string, over = {}) => makeLine({ ingredientId: id, name, quantity: 500, pack: null, estimatedCostCents: null, ...over })
const ticked = (id: number, name: string) => line(id, name, { ticked: true, quantity: 0, tick: makeTick() })

function setup(lines: ReturnType<typeof line>[]) {
  const view = render(<ShoppingBody {...base} list={makeList({ lines })} />)
  const update = (next: ReturnType<typeof line>[]) => view.rerender(<ShoppingBody {...base} list={makeList({ lines: next })} />)
  return { update }
}
const tick = (name: string) => screen.getByRole('button', { name: `Tick ${name}` })

describe('ShoppingBody: focus after a row leaves To get', () => {
  it('after Dill is ticked, focus is on the next row\'s tick (Rice)', async () => {
    const { update } = setup([line(1, 'Dill'), line(2, 'Rice'), line(3, 'Salt')])
    tick('Dill').focus()
    update([ticked(1, 'Dill'), line(2, 'Rice'), line(3, 'Salt')])
    await Promise.resolve()
    expect(tick('Rice')).toHaveFocus()
  })

  it('after the last row is ticked, focus goes to the previous row\'s tick', async () => {
    const { update } = setup([line(1, 'Dill'), line(2, 'Rice')])
    tick('Rice').focus()
    update([line(1, 'Dill'), ticked(2, 'Rice')])
    await Promise.resolve()
    expect(tick('Dill')).toHaveFocus()
  })

  it('after the only open row is ticked, focus is on a heading of the page, not on <body>', async () => {
    const { update } = setup([line(1, 'Dill')])
    tick('Dill').focus()
    update([ticked(1, 'Dill')])
    await Promise.resolve()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement?.tagName).toMatch(/^H[1-6]$/)
  })

  it('a row that is still there keeps focus (an Undo, a refresh)', async () => {
    const { update } = setup([line(1, 'Dill'), line(2, 'Rice')])
    tick('Rice').focus()
    update([line(1, 'Dill'), line(2, 'Rice', { quantity: 600 })])
    await Promise.resolve()
    expect(tick('Rice')).toHaveFocus()
  })

  it('focus the person moved elsewhere on purpose is never stolen', async () => {
    const { update } = setup([line(1, 'Dill'), line(2, 'Rice')])
    tick('Dill').focus()
    screen.getByRole('button', { name: 'Scan' }).focus()
    update([ticked(1, 'Dill'), line(2, 'Rice')])
    await Promise.resolve()
    expect(screen.getByRole('button', { name: 'Scan' })).toHaveFocus()
  })
})

describe('ShoppingBody: focus back on a row after an Undo (A11Y-07)', () => {
  it('the row named by restoreFocusKey takes the focus on its tick once it is back, and the screen is told', async () => {
    const onFocusRestored = vi.fn()
    const lines = [line(1, 'Dill'), line(2, 'Rice')]
    const view = render(<ShoppingBody {...base} list={makeList({ lines: [ticked(1, 'Dill'), line(2, 'Rice')] })} restoreFocusKey="line:1" onFocusRestored={onFocusRestored} />)
    expect(onFocusRestored).not.toHaveBeenCalled() // Dill is not open yet
    view.rerender(<ShoppingBody {...base} list={makeList({ lines })} restoreFocusKey="line:1" onFocusRestored={onFocusRestored} />)
    expect(tick('Dill')).toHaveFocus()
    expect(onFocusRestored).toHaveBeenCalledOnce()
  })

  it('never takes the focus from a place the person chose (outside the lists and the toast)', () => {
    const onFocusRestored = vi.fn()
    const view = render(<ShoppingBody {...base} list={makeList({ lines: [line(1, 'Dill')] })} />)
    screen.getByRole('button', { name: 'Scan' }).focus()
    view.rerender(<ShoppingBody {...base} list={makeList({ lines: [line(1, 'Dill'), line(3, 'Salt')] })} restoreFocusKey="line:3" onFocusRestored={onFocusRestored} />)
    expect(screen.getByRole('button', { name: 'Scan' })).toHaveFocus()
    expect(onFocusRestored).toHaveBeenCalledOnce()
  })
})
