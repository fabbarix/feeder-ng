// B9-43 (SSP-09): the Shop's "Put away 17 Stock Lots" opens /pantry?putAway=1: the Pantry opens its Put away sheet over the Not sorted Lots
// once they have loaded (once per address), and closing the sheet removes the parameter with replace (Back does not reopen it).
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { makeLot } from '../testData'
import type { StockLot } from '../types'
import { usePutAwayParam } from './useLotParam'

const lots = [makeLot({ id: 1, storagePlaceId: null }), makeLot({ id: 2, storagePlaceId: 4 }), makeLot({ id: 3, storagePlaceId: null })]

function setup(url: string, initial: StockLot[] | undefined) {
  const onOpen = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  const view = renderHook(
    ({ data }: { data: StockLot[] | undefined }) => {
      const loc = useLocation()
      return { param: usePutAwayParam(data, onOpen), search: loc.search }
    },
    { wrapper, initialProps: { data: initial } },
  )
  return { onOpen, view }
}

describe('usePutAwayParam', () => {
  it('waits for the Lots, then opens the sheet once over the Not sorted ones', () => {
    const { onOpen, view } = setup('/pantry?putAway=1', undefined)
    expect(onOpen).not.toHaveBeenCalled()
    view.rerender({ data: lots })
    expect(onOpen).toHaveBeenCalledExactlyOnceWith([lots[0], lots[2]])
    view.rerender({ data: [...lots] })
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('clear() removes the parameter, keeping the others', () => {
    const { view } = setup('/pantry?view=places&putAway=1', lots)
    act(() => view.result.current.param.clear())
    expect(view.result.current.search).toBe('?view=places')
  })

  it('nothing Not sorted: nothing opens and the parameter goes', () => {
    const { onOpen, view } = setup('/pantry?putAway=1', [makeLot({ id: 2, storagePlaceId: 4 })])
    expect(onOpen).not.toHaveBeenCalled()
    expect(view.result.current.search).toBe('')
  })

  it('without the parameter nothing opens', () => {
    const { onOpen } = setup('/pantry', lots)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
