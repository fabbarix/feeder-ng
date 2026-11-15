// B9-14 / A11Y-07 "a row leaves its list": `useFocusKeeper(ref, options?)` (`ui/lib/useFocusKeeper.ts`). ListGroup (B9-13's file) and any list
// use it. Rows are the elements matching options.rowSelector (default '[data-focus-key]', the key being that attribute's value). On
// focusin it records the focused row's key and position; after the container's children change, when focus has fallen to <body> or
// to a removed element and the recorded row is gone, focus goes to focusSuccessor's row (its row element itself when focusable, else
// its first control), else options.heading() (made focusable with tabIndex -1), else the container itself (tabIndex -1).
// It never steals focus that is somewhere else on purpose.
import { act, render, screen, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { useFocusKeeper } from './useFocusKeeper'

function List({ keys, heading = true, withHeadingOption = true }: { keys: string[]; heading?: boolean; withHeadingOption?: boolean }) {
  const ref = useRef<HTMLUListElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useFocusKeeper(ref, withHeadingOption ? { heading: () => headingRef.current } : undefined)
  return (
    <div>
      {heading ? <h2 ref={headingRef}>To get</h2> : null}
      <ul ref={ref} aria-label="Lines">
        {keys.map((k) => (
          <li key={k} data-focus-key={k}>
            <button>Tick {k}</button>
          </li>
        ))}
      </ul>
      <button>Elsewhere</button>
    </div>
  )
}

const focusRow = (k: string) => act(() => screen.getByRole('button', { name: `Tick ${k}` }).focus())

describe('useFocusKeeper (A11Y-07)', () => {
  it('removing the focused row of three focuses the next row', async () => {
    const { rerender } = render(<List keys={['a', 'b', 'c']} />)
    focusRow('b')
    rerender(<List keys={['a', 'c']} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tick c' })).toHaveFocus())
  })
  it('removing the last row focuses the previous row', async () => {
    const { rerender } = render(<List keys={['a', 'b', 'c']} />)
    focusRow('c')
    rerender(<List keys={['a', 'b']} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tick b' })).toHaveFocus())
  })
  it('removing the only row focuses the list heading, which is made focusable', async () => {
    const { rerender } = render(<List keys={['a']} />)
    focusRow('a')
    rerender(<List keys={[]} />)
    const heading = screen.getByRole('heading', { name: 'To get' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(heading).toHaveAttribute('tabindex', '-1')
  })
  it('without a heading option the list itself takes the focus (tabIndex -1, still named by its aria-label)', async () => {
    const { rerender } = render(<List keys={['a']} heading={false} withHeadingOption={false} />)
    focusRow('a')
    rerender(<List keys={[]} heading={false} withHeadingOption={false} />)
    const list = screen.getByRole('list', { name: 'Lines' })
    await waitFor(() => expect(list).toHaveFocus())
    expect(list).toHaveAttribute('tabindex', '-1')
  })
  it('leaves focus alone when it is on something else the user chose', async () => {
    const { rerender } = render(<List keys={['a', 'b', 'c']} />)
    focusRow('b')
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus())
    rerender(<List keys={['a', 'c']} />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus()
  })
  it('does nothing when the focused row is still there', async () => {
    const { rerender } = render(<List keys={['a', 'b']} />)
    focusRow('a')
    rerender(<List keys={['a', 'b', 'c']} />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Tick a' })).toHaveFocus()
  })
})
