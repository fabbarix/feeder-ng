import { useEffect, type RefObject } from 'react'

/**
 * Adds `id` to the aria-describedby of every text input and text area inside `ref`, next to the helper and error ids the field
 * frame sets. TextField and TextArea cannot take an extra description yet (they overwrite aria-describedby), so the reason a
 * feature is off is linked here. Runs after every render, because a field re-sets its own ids when its helper or error changes.
 */
export function useDescribedBy(ref: RefObject<HTMLElement | null>, id: string | undefined): void {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    for (const field of root.querySelectorAll('input, textarea')) {
      const ids = (field.getAttribute('aria-describedby') ?? '').split(' ').filter((x) => x !== '' && x !== id)
      if (id) ids.push(id)
      if (ids.length > 0) field.setAttribute('aria-describedby', ids.join(' '))
      else field.removeAttribute('aria-describedby')
    }
  })
}
