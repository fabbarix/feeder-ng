// The Filters panel of a filter header: its sections, Clear filters and the Show button (docs/design/recipes-filter.md 8;
// pantry-filter.md 5).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../lib/viewport.test-helper'
import { FilterSection } from './FilterSection'
import { FiltersPanel } from './FiltersPanel'

afterEach(() => vi.unstubAllGlobals())

function Harness({ count: initial = 1, onClear = () => {} }: { count?: number; onClear?: () => void }) {
  const anchor = createRef<HTMLButtonElement>()
  const [open, setOpen] = useState(true)
  const [count, setCount] = useState(initial)
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen(true)}>
        Filters
      </button>
      <FiltersPanel
        id="panel"
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchor}
        count={count}
        onClear={() => {
          onClear()
          setCount(0)
        }}
        showLabel="Show Stock"
      >
        <FilterSection heading="Show">
          <button type="button">Use soon</button>
        </FilterSection>
        <FilterSection heading="Storage Place" list>
          <div role="listbox" aria-label="Filter by Storage Place" />
        </FilterSection>
        <FilterSection>
          <button type="button">Lone</button>
        </FilterSection>
      </FiltersPanel>
    </>
  )
}

describe.each([390, 834])('FiltersPanel at %i px', (width) => {
  it('is a dialog "Filters" whose spaced body holds the sections, each with its label heading', () => {
    stubViewportWidth(width)
    render(<Harness />)
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    const body = dialog.querySelector('.filter-panel__body')!
    expect(body).not.toBeNull()
    const sections = [...body.children].filter((c) => c.classList.contains('filter-panel__section'))
    expect(sections).toHaveLength(3)
    expect(within(sections[0] as HTMLElement).getByRole('heading', { level: 3, name: 'Show' })).toHaveClass('filter-panel__heading')
    expect(sections[1]!.querySelector('.filter-panel__list [role="listbox"]')).not.toBeNull()
    expect(within(sections[2] as HTMLElement).queryByRole('heading')).toBeNull()
  })
  it('Show … closes it; Clear filters clears, stays open and hands focus to Show … once it is off', async () => {
    stubViewportWidth(width)
    const onClear = vi.fn()
    render(<Harness onClear={onClear} />)
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    const clear = within(dialog).getByRole('button', { name: 'Clear filters' })
    await userEvent.click(clear)
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(clear).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Show Stock' })).toHaveFocus()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show Stock' }))
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull()
  })
  it('Clear filters is off while no filter is on', () => {
    stubViewportWidth(width)
    render(<Harness count={0} />)
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled()
  })
})

describe('FiltersPanel from 768 px', () => {
  it('is the shared popover, with the feature class beside filter-panel', () => {
    stubViewportWidth(1024)
    const anchor = createRef<HTMLButtonElement>()
    render(
      <>
        <button ref={anchor} type="button">Filters</button>
        <FiltersPanel open onClose={() => {}} anchorRef={anchor} count={0} onClear={() => {}} showLabel="Show Stock" className="pantry-filters__panel">
          <FilterSection heading="Show">x</FilterSection>
        </FiltersPanel>
      </>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(dialog).toHaveClass('popover', 'filter-panel', 'pantry-filters__panel')
  })
})
