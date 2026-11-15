// B9-14 / SHORT-07: the Popover is a BottomSheet when `POPOVER_SHEET_QUERY` matches: (max-width: 767px), (max-height: 599px).
// Phone landscape (844x390) therefore gets the sheet (the centred dialog of SHORT-02), with the R-B Close; a tall desktop keeps the
// floating popover. The panel's `footer` and `id` pass through to the sheet.
import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Popover } from './Popover'

afterEach(() => vi.unstubAllGlobals())

/** matchMedia for a viewport: each comma-separated alternative is a conjunction of (min|max)-(width|height) conditions in px or em. */
function stubViewport(width: number, height: number) {
  const cond = (c: string) => {
    const m = c.match(/\(\s*(min|max)-(width|height)\s*:\s*([\d.]+)(px|em)\s*\)/)
    if (!m) return false
    const limit = Number(m[3]) * (m[4] === 'em' ? 16 : 1)
    const v = m[2] === 'width' ? width : height
    return m[1] === 'min' ? v >= limit : v <= limit
  }
  const matches = (q: string) => q.split(',').some((alt) => alt.split(/\sand\s/).every((c) => cond(c.trim())))
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches(query), media: query, addEventListener() {}, removeEventListener() {} }))
}

function Harness() {
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={anchor}>Filters</button>
      <Popover open onClose={() => {}} anchorRef={anchor} title="Filters" id="filters" footer={<button>Show Stock</button>}>
        <button>Show</button>
      </Popover>
    </>
  )
}

describe('Popover on a short viewport (SHORT-07)', () => {
  it('844x390 (phone landscape): a modal sheet with the Close, not a popover', () => {
    stubViewport(844, 390)
    render(<Harness />)
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).toHaveClass('sheet')
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Stock' })).toBeInTheDocument()
    expect(document.querySelector('.popover')).toBeNull()
  })
  it('1024x599: still a sheet (the height query is max-height: 599px)', () => {
    stubViewport(1024, 599)
    render(<Harness />)
    expect(screen.getByRole('dialog', { name: 'Filters' })).toHaveClass('sheet')
  })
  it('390x844 (portrait phone): a sheet, as before', () => {
    stubViewport(390, 844)
    render(<Harness />)
    expect(screen.getByRole('dialog', { name: 'Filters' })).toHaveClass('sheet')
  })
  it('1024x768: the floating popover', () => {
    stubViewport(1024, 768)
    render(<Harness />)
    const panel = screen.getByRole('dialog', { name: 'Filters' })
    expect(panel.tagName).not.toBe('DIALOG')
    expect(panel).toHaveClass('popover')
  })
  it('the panel id passes to the sheet body, so the trigger aria-controls still resolves', () => {
    stubViewport(844, 390)
    render(<Harness />)
    expect(document.getElementById('filters')).not.toBeNull()
  })
})
