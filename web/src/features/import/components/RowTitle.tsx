import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'

export interface RowTitleProps {
  /** The question id the row answers (lib/reviewSummary.openQuestions): "Go to the first question" and "Next question" land here. */
  question?: string
  children: ReactNode
}

/**
 * The title of an Import Review row: it takes focus from code (tabindex -1), so a jump to a question lands on the row's name, and it names
 * its row: the shared ListRow gives its `li` no name, so the title labels it (aria-labelledby), which lets a row be found by its name.
 */
export function RowTitle({ question, children }: RowTitleProps): ReactNode {
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const row = ref.current?.closest('li')
    if (row && !row.hasAttribute('aria-labelledby')) row.setAttribute('aria-labelledby', id)
  }, [id])
  return (
    <span ref={ref} id={id} className="import-row__title" tabIndex={-1} data-question={question}>
      {children}
    </span>
  )
}
