import { useRef, type KeyboardEvent } from 'react'

export interface RadioOption<V extends string> {
  value: V
  disabled?: boolean
}

/**
 * Roving tabindex for a radiogroup: Tab lands on the checked radio; arrows (and Home/End) select and move focus,
 * wrapping and skipping disabled options.
 */
export function useRovingRadios<V extends string>(options: RadioOption<V>[], value: V, onChange: (value: V) => void) {
  const refs = useRef(new Map<V, HTMLButtonElement>())
  const enabled = options.filter((o) => !o.disabled)
  const checkedIndex = enabled.findIndex((o) => o.value === value)
  const tabStop = checkedIndex >= 0 ? value : enabled[0]?.value

  const select = (target: V | undefined) => {
    if (target === undefined) return
    onChange(target)
    refs.current.get(target)?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, current: V) => {
    const at = enabled.findIndex((o) => o.value === current)
    const count = enabled.length
    if (count === 0) return
    let next: V | undefined
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(at + 1) % count]?.value
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(at - 1 + count) % count]?.value
    else if (e.key === 'Home') next = enabled[0]?.value
    else if (e.key === 'End') next = enabled[count - 1]?.value
    if (next === undefined) return
    e.preventDefault()
    select(next)
  }

  const register = (v: V) => (el: HTMLButtonElement | null) => {
    if (el) refs.current.set(v, el)
    else refs.current.delete(v)
  }

  return { tabStop, onKeyDown, register }
}
