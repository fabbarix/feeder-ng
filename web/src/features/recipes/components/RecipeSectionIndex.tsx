import { useEffect, useState, type ReactNode } from 'react'
import { recipeStrings } from '../strings'

export interface RecipeSectionIndexProps {
  /** Sections in page order: the id of each section element and its label. */
  sections: { id: string; label: string }[]
}

/**
 * E-01: the sticky section index in the editor's left gutter from 1280 px (CSS hides it below; it stays in the DOM).
 * The link just chosen, or the first section an IntersectionObserver reports in view, is the current one.
 */
export function RecipeSectionIndex({ sections }: RecipeSectionIndexProps): ReactNode {
  const [current, setCurrent] = useState<string | null>(null)
  const key = sections.map((s) => s.id).join(',')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting)
        if (hit?.target.id) setCurrent(hit.target.id)
      },
      { rootMargin: '0px 0px -60% 0px' },
    )
    for (const id of key.split(',')) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [key])

  return (
    <nav className="recipe-editor__index" aria-label={recipeStrings.sections}>
      <ul className="recipe-editor__index-list">
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} aria-current={current === s.id ? 'true' : undefined} onClick={() => setCurrent(s.id)}>
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
