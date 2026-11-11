// R2-2 (L-05): useContainerColumns follows the element's own width, whatever the viewport says.
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useContainerColumns } from './useContainerColumns'

type Callback = (entries: Array<{ contentRect: { width: number }; target: Element }>) => void
let callbacks: Callback[] = []

function stubResizeObserver() {
  callbacks = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: Callback) {
        callbacks.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
}
const resizeTo = (width: number) =>
  act(() => {
    for (const cb of callbacks) cb([{ contentRect: { width }, target: document.body }])
  })

function Probe() {
  const { ref, columns } = useContainerColumns()
  return (
    <div ref={ref} data-testid="box">
      {columns}
    </div>
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('useContainerColumns', () => {
  it('follows the observed width: 2, 4, then 7', () => {
    stubResizeObserver()
    render(<Probe />)
    resizeTo(358)
    expect(screen.getByTestId('box')).toHaveTextContent('2')
    resizeTo(1160)
    expect(screen.getByTestId('box')).toHaveTextContent('4')
    resizeTo(1480)
    expect(screen.getByTestId('box')).toHaveTextContent('7')
  })

  it('ignores the viewport: a desktop matchMedia does not give seven columns in a 1160 px container', () => {
    stubResizeObserver()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }))
    render(<Probe />)
    resizeTo(1160)
    expect(screen.getByTestId('box')).toHaveTextContent('4')
  })

  it('answers 4 before the first measure and when ResizeObserver does not exist', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    render(<Probe />)
    expect(screen.getByTestId('box')).toHaveTextContent('4')
  })
})
