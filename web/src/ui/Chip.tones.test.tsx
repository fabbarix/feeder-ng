// B9-17 (DS-06, DS-04, DS-08, A11Y-06, A11Y-09, TB-03, VC6, VC9): the Chip primitive's tones and shapes.
//   - tones: warn (a rule or setting that needs a decision), info (a question, a time to know: "Start Tue 21:30", A2), neutral (a record:
//     "Not cooked", state chips only), and the Overdue info chip;
//   - `as="button"`: a chip that is a button without being a filter (the hero's why chips, Plan's day tiles);
//   - shape: a minimum height (the browser text size grows it), a coarse-pointer hit area, round count badges, a selected filter chip;
//   - truncation: the label ends in an ellipsis, a chip never exceeds its line, and a chip can ask to keep its whole text.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from './Chip'
import { Icon } from './Icon'
import { blocksOf, selectorList, type CssBlock } from './lib/cssWalk.test-helper'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('Chip.css')
const q = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const chipBlocks = blocksOf(['ui']).filter((b) => b.file === 'ui/Chip.css')
const rule = (selector: string): CssBlock[] => chipBlocks.filter((b) => selectorList(q(b.selector)).includes(q(selector)))
const val = (blocks: CssBlock[], prop: string) => blocks.flatMap((b) => b.decls).filter(([p]) => p === prop).map(([, v]) => v).pop()
const svgOf = (el: Element) => el.querySelector('svg')?.outerHTML
const iconHtml = (name: 'warning' | 'info' | 'notCooked' | 'advanceStep') => svgOf(render(<Icon name={name} size={14} />).container)

describe('Chip warn tone (DS-06)', () => {
  it.each(['state', 'status'] as const)('a %s chip takes status="warn"', (kind) => {
    render(<Chip kind={kind} status="warn">Held</Chip>)
    const el = screen.getByText('Held').closest('.chip')!
    expect(el).toHaveAttribute('data-kind', kind)
    expect(el).toHaveAttribute('data-status', 'warn')
  })

  it('a warn chip carries an icon even when none is given (warn is never the only cue): the Warning glyph', () => {
    const { container } = render(<Chip kind="status" status="warn">Held</Chip>)
    expect(svgOf(container)).toBe(iconHtml('warning'))
  })

  it('is the warn pair: the --status-warn-bg fill with --status-warn-fg text, for a state and a status chip', () => {
    for (const kind of ['state', 'status']) {
      expect(declarations(css, `.chip[data-kind='${kind}'][data-status='warn']`)).toMatchObject({
        background: 'var(--status-warn-bg)',
        color: 'var(--status-warn-fg)',
      })
    }
  })
})

describe('Chip info tone (A2: "Start Tue 21:30" on a Planned Meal; the warn chip stays for a held meal)', () => {
  it('<Chip kind="status" status="info"> is the info look, and its default icon is the Info glyph', () => {
    const { container } = render(<Chip kind="status" status="info">Start Tue 21:30</Chip>)
    expect(container.querySelector('.chip')).toHaveAttribute('data-status', 'info')
    expect(svgOf(container)).toBe(iconHtml('info'))
  })

  it('both chips can sit on one row: warn and info resolve to different fills and different text colours', () => {
    const { container } = render(
      <div>
        <Chip kind="status" status="info">Start Tue 21:30</Chip>
        <Chip kind="status" status="warn">Held: outside cooking times</Chip>
      </div>,
    )
    const [info, warn] = Array.from(container.querySelectorAll('.chip'))
    expect(info).toHaveAttribute('data-status', 'info')
    expect(warn).toHaveAttribute('data-status', 'warn')
    const infoRule = declarations(css, ".chip[data-kind='status'][data-status='info']")
    const warnRule = declarations(css, ".chip[data-kind='status'][data-status='warn']")
    expect(infoRule['background']).toBe('var(--color-info-bg)')
    expect(infoRule['color']).toBe('var(--color-info-fg)')
    expect(infoRule['background']).not.toBe(warnRule['background'])
    expect(infoRule['color']).not.toBe(warnRule['color'])
  })
})

describe('Chip neutral state chip (DS-06 "Not cooked": a record, not a problem)', () => {
  it('<Chip kind="state" status="neutral" icon="notCooked"> renders data-status="neutral"', () => {
    const { container } = render(<Chip kind="state" status="neutral" icon="notCooked">Not cooked</Chip>)
    const el = container.querySelector('.chip')!
    expect(el).toHaveAttribute('data-kind', 'state')
    expect(el).toHaveAttribute('data-status', 'neutral')
    expect(svgOf(container)).toBe(iconHtml('notCooked'))
  })

  it('has no default icon: a neutral chip shows what it is given (the XCircle is passed by the caller)', () => {
    const { container } = render(<Chip kind="state" status="neutral">Skipped</Chip>)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('is a surface-2 fill, a text label and a muted icon (the existing why-chip pair, already tested)', () => {
    expect(declarations(css, ".chip[data-kind='state'][data-status='neutral']")).toMatchObject({ background: 'var(--color-surface-2)', color: 'var(--color-text)' })
    expect(declarations(css, ".chip[data-kind='state'][data-status='neutral'] > svg")['color']).toBe('var(--color-muted)')
  })

  it('neutral is allowed only with kind="state": a status chip with status="neutral" falls back to the tag look and warns in dev', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<Chip kind="status" status="neutral">x</Chip>)
    expect(container.querySelector('.chip')).toHaveAttribute('data-kind', 'tag')
    expect(container.querySelector('.chip')).not.toHaveAttribute('data-status')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('Chip overdue (DS-06: the board\'s "Overdue" chip, the info tone with a ring)', () => {
  it('overdue writes data-overdue="true" on an info chip', () => {
    const { container } = render(<Chip kind="status" status="info" overdue icon="advanceStep">Overdue</Chip>)
    expect(container.querySelector('.chip')).toHaveAttribute('data-overdue', 'true')
    expect(svgOf(container)).toBe(iconHtml('advanceStep'))
  })

  it('overdue is allowed only with status="info": on any other status it is ignored (no attribute) and warns in dev', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<Chip kind="status" status="spoil" overdue>Overdue</Chip>)
    expect(container.querySelector('.chip')).not.toHaveAttribute('data-overdue')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('is a surface chip with a 1 px info ring and info text', () => {
    const d = declarations(css, ".chip[data-status='info'][data-overdue='true']")
    expect(d['background']).toBe('var(--color-surface)')
    expect(d['color']).toBe('var(--color-info-fg)')
    expect(d['box-shadow']).toBe('inset 0 0 0 1px var(--color-info-fg)')
  })

  it('a chip without overdue has no ring', () => {
    const { container } = render(<Chip kind="status" status="info">Start Tue 21:30</Chip>)
    expect(container.querySelector('.chip')).not.toHaveAttribute('data-overdue')
  })
})

describe('Chip as="button" (TB-03: a chip that opens something, without being a filter)', () => {
  it('renders a <button type="button"> named by its text, calls onClick, and is not a toggle (no aria-pressed)', async () => {
    const onClick = vi.fn()
    render(<Chip as="button" kind="why" icon="leftover" onClick={onClick}>Uses Beef by Tue</Chip>)
    const b = screen.getByRole('button', { name: 'Uses Beef by Tue' })
    expect(b.tagName).toBe('BUTTON')
    expect(b).toHaveAttribute('type', 'button')
    expect(b).not.toHaveAttribute('aria-pressed')
    await userEvent.click(b)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('takes a longer accessible name through `label` (it should start with the visible text): "Why: uses Beef by Tue. Open the Planned Meal"', () => {
    render(<Chip as="button" kind="why" label="Why: uses Beef by Tue. Open the Planned Meal" onClick={() => {}}>Uses Beef by Tue</Chip>)
    expect(screen.getByRole('button', { name: 'Why: uses Beef by Tue. Open the Planned Meal' })).toBeInTheDocument()
  })

  it('works for every kind that is not a filter, and keeps the kind\'s look (data-kind, data-status)', () => {
    render(<Chip as="button" kind="status" status="info" onClick={() => {}}>Start Tue 21:30</Chip>)
    const b = screen.getByRole('button')
    expect(b).toHaveAttribute('data-kind', 'status')
    expect(b).toHaveAttribute('data-status', 'info')
  })

  it('a disabled chip button does not call onClick', async () => {
    const onClick = vi.fn()
    render(<Chip as="button" kind="why" disabled onClick={onClick}>x</Chip>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('without an onClick (or onRemove) it is not a button: a span chip, and a dev warning (a button that does nothing is a trap)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<Chip as="button" kind="why">x</Chip>)
    expect(screen.queryByRole('button')).toBeNull()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('a clickable chip with no `as` is still a button (existing callers keep working)', () => {
    render(<Chip kind="why" onClick={() => {}}>x</Chip>)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('as="span" (or no as) with no onClick stays a span', () => {
    const { container } = render(<Chip as="span" kind="why">x</Chip>)
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('span.chip')).not.toBeNull()
  })
})

describe('Chip shape: a minimum height, never a fixed one (DS-08, DS-A)', () => {
  it('.chip has min-block-size 1.625rem and block-size auto: a 24 px browser text size does not clip the label', () => {
    const chip = declarations(css, '.chip')
    expect(chip['min-block-size']).toBe('1.625rem')
    expect(chip['block-size']).toBe('auto')
    expect(chip['white-space']).toBe('nowrap')
  })

  it('still one line: nothing in Chip.css lets the label wrap', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/white-space:\s*normal/)
  })

  it('a chip never exceeds its line (DS-04): max-inline-size 100% and min-inline-size 0, so the label can shrink', () => {
    const chip = declarations(css, '.chip')
    expect(chip['max-inline-size']).toBe('100%')
    expect(chip['min-inline-size']).toBe('0')
  })

  it('the label shrinks and ends in an ellipsis; the icon and the remove glyph never shrink', () => {
    const label = declarations(css, '.chip__label')
    expect(label['overflow']).toBe('hidden')
    expect(label['text-overflow']).toBe('ellipsis')
    expect(label['min-inline-size']).toBe('0')
    expect(declarations(css, '.chip > svg')['flex']).toBe('none')
  })

  it('the full text stays the tooltip and, for a button chip, the accessible name (DS-04: "Remove Tag HEARTY HOMEMADE MUSHROOM WELLINGTONS")', () => {
    const long = 'HEARTY HOMEMADE MUSHROOM WELLINGTONS'
    render(<Chip kind="tag" onRemove={() => {}} removeLabel={`Remove Tag ${long}`}>{long}</Chip>)
    const b = screen.getByRole('button', { name: `Remove Tag ${long}` })
    expect(b).toHaveAttribute('title', long)
  })
})

describe('Chip keeps its whole text on request (a "Leftover for Fri" chip on a Plan row is not cut to "Leftover …")', () => {
  it('<Chip whole> writes data-whole and the CSS keeps the chip from shrinking below its text (still capped at 100% of its line)', () => {
    const { container } = render(<Chip kind="status" status="leftover" whole>Leftover for Fri</Chip>)
    expect(container.querySelector('.chip')).toHaveAttribute('data-whole', 'true')
    const d = declarations(css, ".chip[data-whole='true']")
    expect(d['flex']).toBe('none')
    expect(d['max-inline-size']).toBe('100%')
  })

  it('without `whole` a chip may shrink (flex: 0 1 auto) so a row of chips shares a narrow line, and has no data-whole', () => {
    const { container } = render(<Chip kind="status" status="leftover">Leftover for Fri</Chip>)
    expect(container.querySelector('.chip')).not.toHaveAttribute('data-whole')
    expect(declarations(css, '.chip')['flex']).toBe('0 1 auto')
  })
})

describe('Chip count: a proper round shape (VC6: "count badges are round, never ovals")', () => {
  it('the count chip is a circle for one digit and a pill for more: min width equals its min height, fully rounded, centred, tabular', () => {
    const d = declarations(css, ".chip[data-kind='count']")
    expect(d['min-inline-size']).toBe('1.625rem')
    expect(d['justify-content']).toBe('center')
    expect(d['border-radius']).toBe('var(--radius-pill)')
    expect(d['font-variant-numeric']).toBe('tabular-nums')
    expect(declarations(css, '.chip')['min-block-size']).toBe(d['min-inline-size'])
  })

  it('it is never squashed: a count chip does not shrink', () => {
    expect(declarations(css, ".chip[data-kind='count']")['flex']).toBe('none')
  })
})

describe('Chip hit area on a coarse pointer (A11Y-09: a non-filter chip that is a button is 26 px, the target is 44)', () => {
  const coarse = chipBlocks.filter((b) => b.atrules.some((a) => /pointer:\s*coarse/.test(a)))

  it('under (pointer: coarse) a button chip draws a --target-min hit area with ::after, without growing its visual', () => {
    const after = coarse.filter((b) => selectorList(q(b.selector)).some((s) => /button\.chip(\[[^\]]*\])?::after$/.test(s) || /\.chip\[data-removable\]::before$/.test(s) || /button\.chip::after/.test(s)))
    expect(after.length).toBeGreaterThan(0)
    expect(val(after, 'content')).toBe("''")
    expect(val(after, 'position')).toBe('absolute')
    expect(val(after, 'min-block-size')).toBe('var(--target-min)')
    expect(val(after, 'min-inline-size')).toBe('var(--target-min)')
  })

  it('the visual size is the same on a coarse pointer: no rule under (pointer: coarse) sets a height on .chip itself', () => {
    const own = coarse.filter((b) => selectorList(q(b.selector)).includes('.chip') || selectorList(q(b.selector)).includes('button.chip'))
    expect(own.flatMap((b) => b.decls).filter(([p]) => /^(min-)?block-size$|^height$/.test(p))).toEqual([])
  })

  it('the filter chip keeps its unconditional 44 px area (A11Y-09 census: 26 to 44 already)', () => {
    expect(declarations(css, ".chip[data-kind='filter']::after")['position']).toBe('absolute')
  })
})

describe('Chip selected (A11Y-06): a selected filter chip is the one selected look with a Check', () => {
  it('shows the Check while selected and exposes aria-pressed', () => {
    render(<Chip kind="filter" selected onClick={() => {}}>Fish</Chip>)
    const b = screen.getByRole('button', { name: 'Fish' })
    expect(b).toHaveAttribute('aria-pressed', 'true')
    expect(b.querySelector('svg')).not.toBeNull()
  })

  it('is the --selected-bg container with --selected-fg text and a --selected-ring-width ring in --selected-ring, not the on-accent solid', () => {
    const d = declarations(css, ".chip[data-kind='filter'][aria-pressed='true']")
    expect(d['background']).toBe('var(--selected-bg)')
    expect(d['color']).toBe('var(--selected-fg)')
    expect(d['box-shadow']).toBe('inset 0 0 0 var(--selected-ring-width) var(--selected-ring)')
  })

  it('a tag-coloured selected filter chip keeps its tint and still shows the ring (the ring, not the fill, carries the state)', () => {
    const tinted = rule(".chip[data-kind='filter'][data-tag-colour='tomato'][aria-pressed='true']")
    expect(val(tinted, 'background')).toBe('var(--tag-tomato-bg)')
    expect(val(tinted, 'box-shadow') ?? val(rule(".chip[data-kind='filter'][aria-pressed='true']"), 'box-shadow')).toMatch(/--selected-ring/)
  })
})

describe('Chip focus: one ring, the global one (A11Y-02)', () => {
  it('a chip inside a hero rings in the hero\'s own colour: it sets nothing, the hero sets --focus-ring-color', () => {
    expect(css).not.toMatch(/--focus-ring-color\s*:/)
  })
})
