import { useRef, type KeyboardEvent } from 'react'

export interface RadioOption<V extends string> {
  value: V
  disabled?: boolean
}

/**
 * Roving tabindex for a radiogroup: Tab lands on the checked radio (the first enabled one when nothing is checked); arrows (and Home/End)
 * wrap and skip disabled options. `auto` (default): an arrow also chooses. `manual`: an arrow only moves the focus; the choice is made by
 * Space, Enter or a click (the button's own activation).
 */
export function useRovingRadios<V extends string | null>(
  options: RadioOption<NonNullable<V>>[],
  value: V,
  onChange: (value: NonNullable<V>) => void,
  activation: 'auto' | 'manual' = 'auto',
) {
  type K = NonNullable<V>
  const refs = useRef(new Map<K, HTMLButtonElement>())
  const enabled = options.filter((o) => !o.disabled)
  const checkedIndex = value === null ? -1 : enabled.findIndex((o) => o.value === value)
  const tabStop: K | undefined = checkedIndex >= 0 ? (value as K) : enabled[0]?.value

  const select = (target: K | undefined) => {
    if (target === undefined) return
    if (activation === 'auto') onChange(target)
    refs.current.get(target)?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, current: K) => {
    const at = enabled.findIndex((o) => o.value === current)
    const count = enabled.length
    if (count === 0) return
    let next: K | undefined
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(at + 1) % count]?.value
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(at - 1 + count) % count]?.value
    else if (e.key === 'Home') next = enabled[0]?.value
    else if (e.key === 'End') next = enabled[count - 1]?.value
    if (next === undefined) return
    e.preventDefault()
    select(next)
  }

  const register = (v: K) => (el: HTMLButtonElement | null) => {
    if (el) refs.current.set(v, el)
    else refs.current.delete(v)
  }

  return { tabStop, onKeyDown, register }
}
