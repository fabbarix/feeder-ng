import { useEffect, useRef, type RefObject } from 'react'
import { focusFirstInvalid } from './focusFirstInvalid'

const hasErrors = (errors: Record<string, unknown> | unknown[] | null | undefined) =>
  Array.isArray(errors) ? errors.length > 0 : errors ? Object.values(errors).some(Boolean) : false

/**
 * After a submit that leaves errors, focuses the first invalid field in the form (SAFE-04). It runs only when `submitCount`
 * grows: never on mount, and never while the person is fixing fields and the errors change by themselves.
 */
export function useFocusFirstInvalid(formRef: RefObject<ParentNode | null>, errors: Record<string, unknown> | unknown[] | null | undefined, submitCount: number): void {
  const handled = useRef(submitCount)
  useEffect(() => {
    if (submitCount <= handled.current) return
    handled.current = submitCount
    if (hasErrors(errors)) focusFirstInvalid(formRef.current)
  }, [formRef, errors, submitCount])
}
