// B9-17 (PC-03, DS-06, A11Y-02 R-C+, A11Y-09): TimerTile `size="md"` (the Cook Mode rail tile, from 1024 px) and `density`.
//   md: a 2-line body-strong label (no upper-case overline) and a place line, the time in `display`, 44 px circular outline Pause and
//   the options button, and the tile is a focus scope: a focused control rings INSIDE itself on the soft fill (R-C+).
//   density="compact": the tile for a tight grid (the board): no progress bar, less padding, a smaller time.
// Unchanged: the default tile (the Cook strip's old tile, the board), whose tests are in TimerTile.test.tsx.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { blocksOf, selectorList, type CssBlock } from './lib/cssWalk.test-helper'
import { TimerTile } from './TimerTile'
import { readUiCss } from './test-utils'

const css = readUiCss('TimerTile.css')
const q = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const blocks = blocksOf(['ui']).filter((b) => b.file === 'ui/TimerTile.css')
const rule = (selector: string): CssBlock[] => blocks.filter((b) => selectorList(q(b.selector)).includes(q(selector)))
const val = (bs: CssBlock[], prop: string) => bs.flatMap((b) => b.decls).filter(([p]) => p === prop).map(([, v]) => v).pop()

describe('TimerTile size="md" (PC-03 rail tile)', () => {
  const props = { label: 'Pre-heat the oven to 220 °C and put the tray in', seconds: 163, running: true, place: 'Step 1 · Roast chicken with rice' } as const

  it('is a tile with data-size="md", still role="timer" named after the timer', () => {
    render(<TimerTile {...props} size="md" />)
    const t = screen.getByRole('timer', { name: props.label })
    expect(t).toHaveClass('tile', 'timer-tile')
    expect(t).toHaveAttribute('data-size', 'md')
  })

  it('the label is a body-strong paragraph of up to two lines, NOT the upper-case tile overline (PC round 1: "labels 12 px, weight 800, upper case, cut off")', () => {
    const { container } = render(<TimerTile {...props} size="md" />)
    expect(container.querySelector('.tile__overline')).toBeNull()
    expect(container.querySelector('p.timer-tile__label')).toHaveTextContent(props.label)
    const label = rule(".timer-tile[data-size='md'] .timer-tile__label")
    expect(val(label, 'font-size')).toBe('var(--text-body-strong-size)')
    expect(val(label, 'line-height')).toBe('var(--text-body-strong-line)')
    expect(val(label, '-webkit-line-clamp')).toBe('2')
    expect(val(label, 'text-transform') ?? 'none').toBe('none')
  })

  it('the place line (where the timer belongs) is a muted meta line under the label', () => {
    const { container } = render(<TimerTile {...props} size="md" />)
    expect(container.querySelector('.timer-tile__place')).toHaveTextContent(props.place)
    const place = rule(".timer-tile[data-size='md'] .timer-tile__place")
    expect(val(place, 'color')).toBe('var(--color-muted)')
    expect(val(place, 'font-size')).toBe('var(--text-meta-size)')
  })

  it('without `place` there is no place element; the default size ignores `place`', () => {
    const md = render(<TimerTile label="Rice" seconds={90} running size="md" />).container
    expect(md.querySelector('.timer-tile__place')).toBeNull()
    const sm = render(<TimerTile label="Rice" seconds={90} running place="Step 2" />).container
    expect(sm.querySelector('.timer-tile__place')).toBeNull()
  })

  it('the time is the `display` role, tabular', () => {
    const { container } = render(<TimerTile {...props} size="md" />)
    expect(container.querySelector('.timer-tile__time')).toHaveTextContent('2:43')
    const time = rule('.timer-tile__time')
    expect(val(time, 'font-size')).toBe('var(--text-display-size)')
    expect(val(time, 'font-variant-numeric')).toBe('tabular-nums')
  })

  it('every control is a 44 px-target circular outline IconButton: data-shape="circle", the md size, never compact', () => {
    render(<TimerTile {...props} size="md" onToggle={() => {}} onMore={() => {}} />)
    for (const name of [`Pause ${props.label}`, `Options for ${props.label}`]) {
      const b = screen.getByRole('button', { name })
      expect(b).toHaveAttribute('data-shape', 'circle')
      expect(b).toHaveAttribute('data-size', 'md')
    }
  })

  it('the default size keeps its compact squircle controls (existing callers do not change)', () => {
    render(<TimerTile label="Rice" seconds={90} running onToggle={() => {}} />)
    const b = screen.getByRole('button', { name: 'Pause Rice' })
    expect(b).toHaveAttribute('data-size', 'compact')
    expect(b).not.toHaveAttribute('data-shape')
  })

  it('Pause / Resume, Add a minute, Cancel and Dismiss keep their names and handlers at md; onMore adds "Options for <label>"', async () => {
    const onMore = vi.fn()
    const onToggle = vi.fn()
    render(<TimerTile {...props} size="md" onToggle={onToggle} onAddMinute={() => {}} onCancel={() => {}} onDismiss={() => {}} onMore={onMore} />)
    expect(screen.getAllByRole('button')).toHaveLength(5)
    await userEvent.click(screen.getByRole('button', { name: `Options for ${props.label}` }))
    await userEvent.click(screen.getByRole('button', { name: `Pause ${props.label}` }))
    expect(onMore).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('onMore does nothing at the default size (no button: the compact tile has no overflow)', () => {
    render(<TimerTile label="Rice" seconds={90} running onMore={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is a focus scope (R-C+): the tile carries data-focus-scope and its own 1 px outline boundary, which the focus layer steps back', () => {
    render(<TimerTile {...props} size="md" onToggle={() => {}} />)
    expect(screen.getByRole('timer')).toHaveAttribute('data-focus-scope')
    expect(val(rule(".timer-tile[data-size='md']"), 'box-shadow')).toMatch(/inset 0 0 0 1px var\(--color-outline\)/)
  })

  it('the default tile is not a scope (16 px of padding: its controls ring outside, R-C)', () => {
    render(<TimerTile label="Rice" seconds={90} running onToggle={() => {}} />)
    expect(screen.getByRole('timer')).not.toHaveAttribute('data-focus-scope')
  })

  it('the controls keep 4 px of fill from the tile boundary: the control row is padded by the tile padding token', () => {
    expect(val(rule('.timer-tile__controls'), 'gap')).toBe('var(--space-2)')
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\bpadding[^:]*:\s*[0-9.]+px/)
  })
})

describe('TimerTile states keep the tone rules (DS-06, VC9)', () => {
  it('finished is the success tone (a status tile)', () => {
    render(<TimerTile label="Rice" seconds={0} running />)
    const t = screen.getByRole('timer')
    expect(t).toHaveAttribute('data-variant', 'status')
    expect(t).toHaveAttribute('data-status', 'success')
  })

  it('overdue (counting up, "+0:42") is info, not spoil: lateness is never red or peach (DS-06 "carried by the words, the order and the chip"); spoil means food', () => {
    render(<TimerTile label="Rice" seconds={-42} running />)
    const t = screen.getByRole('timer')
    expect(t).toHaveAttribute('data-state', 'overdue')
    expect(t).toHaveAttribute('data-status', 'info')
    expect(t).toHaveTextContent('+0:42')
  })

  it('the overdue bar is the info colour, not --status-spoil-solid', () => {
    const fill = rule(".timer-tile[data-state='overdue'] .timer-tile__fill")
    expect(val(fill, 'background')).toBe('var(--color-info-fg)')
  })

  it('paused is surface-2 and running is soft, as before', () => {
    const paused = render(<TimerTile label="Eggs" seconds={30} running={false} />).container.querySelector('.timer-tile')!
    expect(paused).toHaveAttribute('data-state', 'paused')
    const running = render(<TimerTile label="Eggs" seconds={30} running />).container.querySelector('.timer-tile')!
    expect(running).toHaveAttribute('data-variant', 'soft')
  })
})

describe('TimerTile density (PC-03, DS-08)', () => {
  it('density="compact" writes data-density="compact"; the default writes nothing', () => {
    const c = render(<TimerTile label="Rice" seconds={90} running density="compact" />).container.querySelector('.timer-tile')!
    expect(c).toHaveAttribute('data-density', 'compact')
    const d = render(<TimerTile label="Rice" seconds={90} running />).container.querySelector('.timer-tile')!
    expect(d).not.toHaveAttribute('data-density')
  })

  it('a compact tile drops the progress bar even when totalSeconds is given (a tight grid has no room for a 4 px bar nobody reads)', () => {
    const { container } = render(<TimerTile label="Rice" seconds={90} totalSeconds={300} running density="compact" />)
    expect(container.querySelector('.timer-tile__bar')).toBeNull()
    const full = render(<TimerTile label="Rice" seconds={90} totalSeconds={300} running />).container
    expect(full.querySelector('.timer-tile__bar')).not.toBeNull()
  })

  it('a compact tile uses the title-1 role for the time and the tile padding token, never a raw length', () => {
    const time = rule(".timer-tile[data-density='compact'] .timer-tile__time")
    expect(val(time, 'font-size')).toBe('var(--text-title-1-size)')
    expect(val(time, 'line-height')).toBe('var(--text-title-1-line)')
    const tile = rule(".timer-tile[data-density='compact']")
    expect(val(tile, 'padding')).toMatch(/^var\(--space-\d\)$/)
  })

  it('density and size combine: md + compact keeps the circular controls and the focus scope', () => {
    render(<TimerTile label="Rice" seconds={90} running size="md" density="compact" onToggle={() => {}} />)
    expect(screen.getByRole('timer')).toHaveAttribute('data-focus-scope')
    expect(screen.getByRole('button', { name: 'Pause Rice' })).toHaveAttribute('data-shape', 'circle')
  })
})

describe('TimerTile motion', () => {
  it('the finished pulse and the fill transition are dropped under reduced motion (unchanged)', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation:\s*none/)
  })
})
