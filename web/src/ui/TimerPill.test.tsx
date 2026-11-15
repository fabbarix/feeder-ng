// B9-17 (PC-03, PC-04, A11Y-02 R-C+, A11Y-09, VC3, VC6): ui/TimerPill, the one shared timer pill.
//   Cook Mode's timer strip shows one per timer (a nested round Pause, the timer that holds Next has an accent boundary);
//   the shell (B9-25, app/AppShell) shows the household's soonest timer outside Cook Mode (a "+N" badge when more exist).
// The pill is a FOCUS SCOPE: it has its own boundary and under 9 px of padding around its controls, so a focused control rings INSIDE
// itself on the soft fill and the pill's accent boundary steps back (rule R-C+, A11Y-02 final). Placement (fixed, in the top bar) is the
// shell's, not the primitive's: TimerPill.css positions nothing.
// BDD scenarios of the chapters (PC-04 "A timer keeps showing when I leave Cook Mode", "Tapping the timer pill reopens Cook Mode at
// the Step I left") need a browser and the shell: they are covered by B9-25's tests and the page-layout scenario; this file is the
// primitive half.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Icon } from './Icon'
import { blocksOf, selectorList, type CssBlock } from './lib/cssWalk.test-helper'
import { TimerPill } from './TimerPill'
import { readUiCss } from './test-utils'

const css = readUiCss('TimerPill.css')
const q = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const all = blocksOf(['ui'])
const pillBlocks = all.filter((b) => b.file === 'ui/TimerPill.css')
const rule = (selector: string, from: CssBlock[] = pillBlocks): CssBlock[] => from.filter((b) => selectorList(q(b.selector)).includes(q(selector)))
const val = (bs: CssBlock[], prop: string) => bs.flatMap((b) => b.decls).filter(([p]) => p === prop).map(([, v]) => v).pop()
const svgOf = (el: Element) => el.querySelector('svg')?.outerHTML
const iconHtml = (name: 'timer' | 'notifications' | 'pause') => svgOf(render(<Icon name={name} size={20} />).container)

const base = { label: 'Roast the chicken', seconds: 18 * 60 + 42, onOpen: () => {} }

describe('TimerPill: the pill is a button that opens Cook Mode at its timer (PC-04)', () => {
  it('is a group with the timer role and one open button inside, named "Timer: <label>, <m:ss>. Open Cook Mode"', () => {
    render(<TimerPill {...base} />)
    expect(screen.getByRole('timer', { name: 'Roast the chicken' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Timer: Roast the chicken, 18:42. Open Cook Mode' })).toBeInTheDocument()
  })

  it('names the others in the accessible name: "…, and 1 more. Open Cook Mode" (the "+1" badge is aria-hidden, the count is in the name)', () => {
    const { container } = render(<TimerPill {...base} more={1} />)
    expect(screen.getByRole('button', { name: 'Timer: Roast the chicken, 18:42, and 1 more. Open Cook Mode' })).toBeInTheDocument()
    const badge = container.querySelector('.timer-pill__more')!
    expect(badge).toHaveTextContent('+1')
    expect(badge).toHaveAttribute('aria-hidden', 'true')
  })

  it('"and N more" is the same for several: "and 3 more"', () => {
    render(<TimerPill {...base} more={3} />)
    expect(screen.getByRole('button', { name: 'Timer: Roast the chicken, 18:42, and 3 more. Open Cook Mode' })).toBeInTheDocument()
  })

  it('without more (or more=0) there is no badge and no "and … more"', () => {
    for (const more of [undefined, 0]) {
      const { container, unmount } = render(<TimerPill {...base} more={more} />)
      expect(container.querySelector('.timer-pill__more')).toBeNull()
      expect(screen.getByRole('button')).not.toHaveAccessibleName(/more/)
      unmount()
    }
  })

  it('the visible time ticks every second while the NAME follows `nameSeconds` (the shell throttles it to once a minute)', () => {
    const { container } = render(<TimerPill {...base} seconds={18 * 60 + 41} nameSeconds={18 * 60 + 42} />)
    expect(container.querySelector('.timer-pill__time')).toHaveTextContent('18:41')
    expect(screen.getByRole('button')).toHaveAccessibleName('Timer: Roast the chicken, 18:42. Open Cook Mode')
  })

  it('a tap or Enter calls onOpen once', async () => {
    const onOpen = vi.fn()
    render(<TimerPill {...base} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.keyboard('{Enter}')
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('shows the timer icon, the label (sentence case as given) and the time', () => {
    const { container } = render(<TimerPill {...base} />)
    expect(svgOf(container)).toBe(iconHtml('timer'))
    expect(container.querySelector('.timer-pill__label')).toHaveTextContent('Roast the chicken')
    expect(container.querySelector('.timer-pill__time')).toHaveTextContent('18:42')
  })

  it('an hour or more reads h:mm:ss', () => {
    const { container } = render(<TimerPill {...base} seconds={3725} />)
    expect(container.querySelector('.timer-pill__time')).toHaveTextContent('1:02:05')
  })
})

describe('TimerPill states', () => {
  it('running (the default) and paused are data-state values; a paused pill shows the Pause glyph and keeps its time', () => {
    const run = render(<TimerPill {...base} />).container.querySelector('.timer-pill')!
    expect(run).toHaveAttribute('data-state', 'running')
    const paused = render(<TimerPill {...base} running={false} />).container
    expect(paused.querySelector('.timer-pill')).toHaveAttribute('data-state', 'paused')
    expect(svgOf(paused.querySelector('.timer-pill__open')!)).toBe(iconHtml('pause'))
  })

  it('finished (seconds 0 or below): the success tone, a bell (not the timer glyph) and the word "finished" in place of the time', () => {
    const { container } = render(<TimerPill {...base} seconds={0} />)
    expect(container.querySelector('.timer-pill')).toHaveAttribute('data-state', 'finished')
    expect(svgOf(container)).not.toBe(iconHtml('timer'))
    expect(container.querySelector('.timer-pill__time')).toHaveTextContent('finished')
    expect(screen.getByRole('button')).toHaveAccessibleName('Timer finished: Roast the chicken. Open Cook Mode')
  })

  it('finished with others: "Timer finished: Roast the chicken, and 1 more. Open Cook Mode"', () => {
    render(<TimerPill {...base} seconds={-5} more={1} />)
    expect(screen.getByRole('button')).toHaveAccessibleName('Timer finished: Roast the chicken, and 1 more. Open Cook Mode')
  })

  it('finished is the success tone with a 2 px success boundary; its badge turns to a surface fill (the surface-2 fill sat on a green one)', () => {
    const fin = rule(".timer-pill[data-state='finished']")
    expect(val(fin, 'background')).toBe('var(--status-success-bg)')
    expect(val(fin, 'color')).toBe('var(--status-success-fg)')
    expect(val(fin, 'box-shadow')).toMatch(/inset 0 0 0 2px var\(--status-success-fg\)/)
    expect(val(rule(".timer-pill[data-state='finished'] .timer-pill__more"), 'background')).toBe('var(--color-surface)')
  })
})

describe('TimerPill with a nested Pause (Cook Mode\'s timer strip)', () => {
  it('onToggle adds a SIBLING button (never nested in the open button) named "Pause <label>" / "Resume <label>", a 40 px circle', async () => {
    const onToggle = vi.fn()
    const { container, rerender } = render(<TimerPill {...base} onToggle={onToggle} />)
    const pause = screen.getByRole('button', { name: 'Pause Roast the chicken' })
    expect(pause).toHaveAttribute('data-shape', 'circle')
    expect(pause.closest('.timer-pill__open')).toBeNull()
    expect(container.querySelector('.timer-pill__open')!.contains(pause)).toBe(false)
    await userEvent.click(pause)
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(<TimerPill {...base} running={false} onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: 'Resume Roast the chicken' })).toBeInTheDocument()
  })

  it('has no Cancel (PC-03: Cancel lives in the timer sheet, behind Undo) and no Dismiss', () => {
    render(<TimerPill {...base} onToggle={() => {}} />)
    expect(screen.queryByRole('button', { name: /cancel|dismiss/i })).toBeNull()
  })

  it('without onToggle there is exactly one button, the shell pill', () => {
    render(<TimerPill {...base} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('the pause button is a 40 px circle (its 44 px target comes from IconButton\'s ::after)', () => {
    const d = rule('.timer-pill__toggle')
    expect(val(d, 'inline-size')).toBe('40px')
    expect(val(d, 'block-size')).toBe('40px')
    expect(val(d, 'border-radius')).toBe('var(--radius-pill)')
    expect(val(d, 'flex')).toBe('none')
  })
})

describe('TimerPill gate: the timer that holds Next has an accent boundary (PC-03)', () => {
  it('gate writes data-gate; the boundary is 2 px accent', () => {
    const { container } = render(<TimerPill {...base} gate />)
    expect(container.querySelector('.timer-pill')).toHaveAttribute('data-gate')
    expect(val(rule(".timer-pill[data-gate]:not(:has(:focus-visible))"), 'box-shadow')).toMatch(/inset 0 0 0 2px var\(--color-accent\)/)
  })

  it('the accent boundary is written so it STEPS BACK while a child has focus: it is applied only when nothing inside has focus-visible (one accent ring at a time, with equal specificity no cascade order can bring it back)', () => {
    const plain = rule('.timer-pill[data-gate]')
    expect(val(plain, 'box-shadow') ?? '').not.toMatch(/--color-accent/)
  })

  it('without gate there is no data-gate', () => {
    const { container } = render(<TimerPill {...base} />)
    expect(container.querySelector('.timer-pill')).not.toHaveAttribute('data-gate')
  })
})

describe('TimerPill is a focus scope (R-C+, A11Y-02 final): a focused button rings inside the pill', () => {
  it('the pill root carries data-focus-scope', () => {
    const { container } = render(<TimerPill {...base} onToggle={() => {}} />)
    expect(container.querySelector('.timer-pill')).toHaveAttribute('data-focus-scope')
  })

  it('the shared focus layer draws the inner ring for any [data-focus-scope] button: 2 px at a -2 px offset on the soft fill (PC-03 CSS test: ".timer-pill :focus-visible has outline-offset: -2px")', () => {
    const inner = all.filter((b) => b.file === 'ui/focusLayer.css' && selectorList(q(b.selector)).some((s) => /^:is\(.*\[data-focus-scope\].*\) :is\(button/.test(s)))
    expect(inner.length).toBeGreaterThan(0)
    expect(val(inner, 'outline')).toBe('var(--focus-ring-inner-width) solid var(--focus-ring-color)')
    expect(val(inner, 'outline-offset')).toBe('calc(-1 * var(--focus-ring-inner-width))')
    expect(val(inner, 'background')).toBe('var(--color-soft)')
  })

  it('TimerPill.css adds no ring of its own and does not fight the layer: no outline, no :focus-visible rule', () => {
    expect(pillBlocks.filter((b) => /:focus-visible/.test(b.selector) && b.decls.some(([p]) => /^outline/.test(p)))).toEqual([])
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/(^|[;{\s])outline(-offset)?\s*:/)
  })

  it('the open button is the scope\'s child: its ring is the inner ring, so its box leaves 4 px of the pill\'s fill: the pill has padding of at least var(--space-1) around its controls and a 52 px minimum height', () => {
    const pill = rule('.timer-pill')
    expect(val(pill, 'min-block-size')).toBe('52px')
    const pad = val(pill, 'padding') ?? val(pill, 'padding-inline') ?? val(pill, 'padding-inline-end') ?? ''
    expect(pad).toMatch(/var\(--space-\d\)/)
  })

  it('the open button is a reset: it fills the pill, draws no border of its own and keeps the pill\'s pill shape for its inner ring (radius inherited)', () => {
    const open = rule('.timer-pill__open')
    expect(val(open, 'border')).toBe('0')
    expect(val(open, 'border-radius')).toBe('inherit')
    expect(val(open, 'background')).toBe('transparent')
    expect(val(open, 'color')).toBe('inherit')
  })
})

describe('TimerPill look (PC-04)', () => {
  it('is a pill: a surface fill, a 1 px --color-outline boundary and a shadow, 52 px high, fully rounded', () => {
    const pill = rule('.timer-pill')
    expect(val(pill, 'background')).toBe('var(--color-surface)')
    expect(val(pill, 'border-radius')).toBe('var(--radius-pill)')
    expect(val(pill, 'box-shadow')).toMatch(/inset 0 0 0 1px var\(--color-outline\)/)
    expect(val(pill, 'display')).toMatch(/flex/)
  })

  it('the label is one line ending in an ellipsis and the time is title-3, tabular', () => {
    const label = rule('.timer-pill__label')
    expect(val(label, 'overflow')).toBe('hidden')
    expect(val(label, 'text-overflow')).toBe('ellipsis')
    expect(val(label, 'min-inline-size')).toBe('0')
    expect(val(label, 'white-space')).toBe('nowrap')
    const time = rule('.timer-pill__time')
    expect(val(time, 'font-size')).toBe('var(--text-title-3-size)')
    expect(val(time, 'font-variant-numeric')).toBe('tabular-nums')
  })

  it('the pill never exceeds its line (max-inline-size 100%) and positions nothing: placement is the shell\'s (B9-25)', () => {
    expect(val(rule('.timer-pill'), 'max-inline-size')).toBe('100%')
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/position:\s*(fixed|sticky)/)
  })

  it('does not slide in under reduced motion: any animation is gated or reset', () => {
    const anim = pillBlocks.filter((b) => b.decls.some(([p]) => /^(animation|transition)/.test(p)))
    for (const b of anim) {
      const ok = b.atrules.some((a) => /prefers-reduced-motion:\s*no-preference/.test(a)) || b.decls.every(([p, v]) => !/^(animation|transition)/.test(p) || /^none\b/.test(v))
      expect(ok, `${b.selector} animates outside no-preference`).toBe(true)
    }
  })
})

describe('TimerPill "+N" badge: a proper 28 px round shape, clear of the pill\'s edge and of every ring (VC6, PC-04 round 2)', () => {
  const more = rule('.timer-pill__more')

  it('is 28 px high, at least 28 px wide, fully rounded, centred, never squashed', () => {
    expect(val(more, 'min-inline-size')).toBe('28px')
    expect(val(more, 'block-size')).toBe('28px')
    expect(val(more, 'border-radius')).toBe('var(--radius-pill)')
    expect(val(more, 'display')).toMatch(/grid|flex/)
    expect(val(more, 'flex')).toBe('none')
  })

  it('has a surface-2 fill and a 1 px outline boundary, meta text at weight 700, tabular', () => {
    expect(val(more, 'background')).toBe('var(--color-surface-2)')
    expect(val(more, 'box-shadow')).toBe('inset 0 0 0 1px var(--color-outline)')
    expect(val(more, 'font-size')).toBe('var(--text-meta-size)')
    expect(val(more, 'font-weight')).toBe('700')
    expect(val(more, 'font-variant-numeric')).toBe('tabular-nums')
  })

  it('sits 8 px (--space-2) from the time and the pill keeps its end padding, so it never touches the pill\'s edge: the open button\'s gap is a token', () => {
    expect(val(rule('.timer-pill__open'), 'gap')).toBe('var(--space-2)')
  })

  it('the badge is a span inside the open button, so a tap on it opens Cook Mode too', async () => {
    const onOpen = vi.fn()
    const { container } = render(<TimerPill {...base} more={2} onOpen={onOpen} />)
    await userEvent.click(container.querySelector('.timer-pill__more')!)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
