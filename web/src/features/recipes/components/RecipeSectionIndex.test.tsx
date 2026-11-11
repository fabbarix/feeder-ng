// R2-1 (E-01): the sticky section index of the editor (visible from 1280 px by CSS; always in the DOM for assistive tech).
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecipeSectionIndex } from './RecipeSectionIndex'

const sections = [
  { id: 'recipe-section-details', label: 'Details' },
  { id: 'recipe-section-photo', label: 'Photo' },
  { id: 'recipe-section-ingredients', label: 'Ingredients' },
  { id: 'recipe-section-steps', label: 'Steps' },
]

type IOCallback = (entries: { target: Element; isIntersecting: boolean }[]) => void
let observers: IOCallback[] = []
beforeEach(() => {
  observers = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IOCallback) {
        observers.push(cb)
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

const view = () =>
  render(
    <>
      <RecipeSectionIndex sections={sections} />
      {sections.map((s) => (
        <section key={s.id} id={s.id} />
      ))}
    </>,
  )

describe('RecipeSectionIndex', () => {
  it('is a navigation named "Sections" with a link per section, in order, to its id', () => {
    view()
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    expect(nav).toHaveClass('recipe-editor__index')
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Details', 'Photo', 'Ingredients', 'Steps'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual(sections.map((s) => `#${s.id}`))
  })
  it('marks the link just chosen as the current section (aria-current="true")', async () => {
    view()
    await userEvent.click(screen.getByRole('link', { name: 'Ingredients' }))
    expect(screen.getByRole('link', { name: 'Ingredients' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Steps' })).not.toHaveAttribute('aria-current')
  })
  it('follows the scroll: the first section the observer reports intersecting becomes current', () => {
    view()
    expect(observers.length).toBeGreaterThan(0)
    act(() => observers.forEach((cb) => cb([{ target: document.getElementById('recipe-section-steps')!, isIntersecting: true }])))
    expect(screen.getByRole('link', { name: 'Steps' })).toHaveAttribute('aria-current', 'true')
  })
  it('works without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    expect(() => view()).not.toThrow()
  })
})
