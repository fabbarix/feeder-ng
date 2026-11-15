// B9-13: the stylesheet side of the ListRow, ListGroup and Avatar slots (ListRow.b9-13.test.tsx has the markup side).
// vitest blanks CSS imports, so the files are read as text (test-utils). Selectors are matched as written in the chapters' proposed CSS.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss, readStylesCss } from './test-utils'

const css = readUiCss('ListRow.css')
const avatar = readUiCss('Avatar.css')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

interface Block {
  prelude: string
  body: string
}
/** Top-level at-rule blocks whose prelude starts with `at` ("@container"), with their raw body (nested rules intact). */
function atBlocks(source: string, at: string): Block[] {
  const s = strip(source)
  const out: Block[] = []
  let i = 0
  while ((i = s.indexOf(at, i)) >= 0) {
    const open = s.indexOf('{', i)
    let depth = 1
    let j = open + 1
    while (j < s.length && depth > 0) {
      if (s[j] === '{') depth++
      else if (s[j] === '}') depth--
      j++
    }
    out.push({ prelude: s.slice(i, open).replace(/\s+/g, ' ').trim(), body: s.slice(open + 1, j - 1) })
    i = j
  }
  return out
}
/** Declarations of the rule `selector` inside an at-rule body (merged); {} when none. */
function inBody(body: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1]!.split(',').map((x) => x.replace(/"/g, "'").replace(/\s+/g, ' ').trim())
    if (!sels.includes(selector)) continue
    for (const d of m[2]!.split(';')) {
      const k = d.indexOf(':')
      if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).replace(/"/g, "'").replace(/\s+/g, ' ').trim()
    }
  }
  return out
}
const containerWith = (needle: RegExp) => atBlocks(css, '@container').filter((b) => needle.test(b.prelude))
const rule = (sel: string) => declarations(css, sel)

describe('DS-01: the target keeps its box inside any row', () => {
  it('.list-row > .list-row__target is position: absolute at (0,2,0), so no lift can collapse it to 0x0', () => {
    expect(rule('.list-row > .list-row__target').position).toBe('absolute')
  })
  it('the interactive lift is scoped to the row’s own trailing slot: `.list-row > .list-row__trailing :is(...)`, never a bare `.list-row__trailing button`', () => {
    const src = strip(css)
    expect(src).not.toMatch(/(^|[\s,}])\.list-row__trailing\s+(button|a|input|select|\[role)/m)
    const m = src.match(/\.list-row\s*>\s*\.list-row__trailing\s*:is\(([^)]*)\)(?::not\(dialog \*\))?\s*\{([^}]*)\}/)
    expect(m, 'a `.list-row > .list-row__trailing :is(…)` rule').not.toBeNull()
    for (const el of ['button', 'a', 'input', 'select', "[role='button']"]) expect(m![1]!.replace(/"/g, "'")).toContain(el)
    expect(m![2]).toMatch(/pointer-events\s*:\s*auto/)
    expect(m![2]).toMatch(/z-index\s*:\s*1\b/)
  })
  // Reviewer (B9-13): the descendant combinator still reached the buttons of a sheet mounted in the slot, at (0,3,0) over the
  // target's (0,2,0), so the sheet's targets were 0x0 in Chrome. The lift leaves a dialog's controls alone, and a dialog in a row
  // takes back pointer events and start alignment.
  it('the lift never reaches a dialog mounted in the slot, and such a dialog is clickable and start-aligned', () => {
    expect(strip(css)).toMatch(/\.list-row\s*>\s*\.list-row__trailing\s*:is\([^)]*\):not\(dialog \*\)\s*\{/)
    expect(rule('.list-row dialog')).toMatchObject({ 'pointer-events': 'auto', 'text-align': 'start' })
  })
  it('the inset focus ring has the thumb radius (B9-07), unchanged', () => {
    expect(rule('.list-row__target:focus-visible')['border-radius']).toBe('var(--radius-thumb)')
  })
})

describe('DS-10: metaLines={2}', () => {
  it("padding-block --space-2 on .list-row[data-meta-lines='2']", () => {
    expect(rule(".list-row[data-meta-lines='2']")['padding-block']).toBe('var(--space-2)')
  })
  it('the meta wraps and starts at the top; its text is clamped at 2 lines with an ellipsis', () => {
    expect(rule(".list-row[data-meta-lines='2'] .list-row__meta")).toMatchObject({ 'white-space': 'normal', 'align-items': 'flex-start' })
    const t = rule(".list-row[data-meta-lines='2'] .list-row__meta-text")
    expect(t['white-space']).toBe('normal')
    expect(t['-webkit-line-clamp']).toBe('2')
    expect(t.overflow).toBe('hidden')
    expect(t.display).toBe('-webkit-box')
    expect(t['-webkit-box-orient']).toBe('vertical')
  })
  it('the default meta is still one line with an ellipsis (a status row never grows)', () => {
    expect(rule('.list-row__meta-text')).toMatchObject({ 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden' })
  })
})

describe('SSP-05: the row-text container and the compact meta', () => {
  it('.list-row__text is a size container named row-text', () => {
    const d = rule('.list-row__text')
    const shorthand = d.container ?? ''
    const named = /row-text/.test(shorthand) || d['container-name'] === 'row-text'
    const typed = /inline-size/.test(shorthand) || d['container-type'] === 'inline-size'
    expect(named && typed).toBe(true)
  })
  it('the compact form is hidden by default', () => {
    expect(rule('.list-row__meta-compact').display).toBe('none')
  })
  it('below 12 rem of text column the compact form shows and the long text stays for assistive technology (visually hidden, not display: none)', () => {
    const [b] = containerWith(/row-text.*12rem/)
    expect(b, '@container row-text (… 12rem)').toBeDefined()
    expect(b!.prelude).toMatch(/(width|inline-size)\s*<\s*12rem/)
    expect(inBody(b!.body, '.list-row__meta-compact').display).not.toBe('none')
    const long = inBody(b!.body, '.list-row__meta-text:has(+ .list-row__meta-compact)')
    expect(long.display).not.toBe('none')
    expect(long.position).toBe('absolute')
    expect(long['clip-path'] ?? long.clip).toBeTruthy()
  })
  it('the compact form ends in an ellipsis on one line', () => {
    const [b] = containerWith(/row-text.*12rem/)
    expect(inBody(b!.body, '.list-row__meta-compact')).toMatchObject({ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' })
  })
  it('below 9 rem the meta icon is dropped; the tone colour stays on the text', () => {
    const [b] = containerWith(/row-text.*9rem/)
    expect(b, '@container row-text (… 9rem)').toBeDefined()
    expect(b!.prelude).toMatch(/(width|inline-size)\s*<\s*9rem/)
    expect(inBody(b!.body, '.list-row__meta > svg').display).toBe('none')
    expect(rule(".list-row__meta[data-status='spoil']").color).toBe('var(--status-spoil-fg)')
  })
  it('the Shop narrow-row rule lives here for every list: below 24 rem of list width, 12 px padding and 8 px gaps (B9-09 value)', () => {
    const [b] = containerWith(/^@container\s*\(\s*(width|inline-size)\s*<\s*24rem\s*\)/)
    expect(b, 'an unnamed @container (width < 24rem) block').toBeDefined()
    const d = inBody(b!.body, '.list-row')
    expect(d['padding-inline']).toBe('var(--space-3)')
    expect(d.gap).toBe('var(--space-2)')
  })
  it('the list is the container that narrow rule reads (.list-group, inline-size)', () => {
    const d = rule('.list-group')
    expect(`${d.container ?? ''} ${d['container-type'] ?? ''}`).toMatch(/inline-size/)
  })
})

describe('SET-03: the actions slot', () => {
  it('on its own line by default (flex: 1 0 100%), and the row wraps', () => {
    const d = rule('.list-row__actions')
    expect(d['flex-basis'] ?? d.flex).toMatch(/100%/)
    expect(rule(".list-row[data-actions='true']")['flex-wrap']).toBe('wrap')
  })
  it('from 35 rem of row it sits at the end of line 1 (flex: none)', () => {
    const [b] = containerWith(/35rem/)
    expect(b, '@container (width >= 35rem)').toBeDefined()
    expect(b!.prelude).toMatch(/(width\s*>=\s*35rem|min-width:\s*35rem|35rem\s*<=\s*width)/)
    expect(inBody(b!.body, '.list-row__actions').flex).toMatch(/^(none|0 0 auto)$/)
  })
  it('the actions catch the pointer above the row target, at the lift’s weight', () => {
    expect(rule('.list-row > .list-row__actions')['pointer-events']).toBe('auto')
  })
  it('the actions line is aligned to the end', () => {
    const d = rule('.list-row__actions')
    expect(d['justify-content'] ?? d['justify-self']).toMatch(/flex-end|end/)
  })
})

describe('PC-06: the below slot', () => {
  it('the row wraps with a --space-1 row gap while it has a below line', () => {
    expect(rule('.list-row[data-has-below]')).toMatchObject({ 'flex-wrap': 'wrap', 'row-gap': 'var(--space-1)' })
  })
  it('the below line spans the whole row after the other items (order 3, flex: 1 0 100%)', () => {
    const d = rule('.list-row__below')
    expect(d.order).toBe('3')
    expect(d.flex).toBe('1 0 100%')
  })
  it('its controls catch the pointer (a +N chip is a button)', () => {
    expect(rule('.list-row > .list-row__below')['pointer-events']).toBe('auto')
  })
})

describe('RES-03: the sync states', () => {
  it('a failed row has a 3 px inset bar in the danger foreground', () => {
    const d = rule(".list-row[data-sync='failed']")
    expect(d['box-shadow']).toMatch(/inset\s+3px\s+0\s+0\s+(0\s+)?var\(--status-danger-fg\)/)
  })
  it('a failed meta is strong', () => {
    const d = rule(".list-row[data-sync='failed'] .list-row__meta")
    expect(d['font-weight']).toBe('var(--text-body-strong-weight)')
  })
  it('a pending meta stays muted', () => {
    expect(rule(".list-row__meta[data-tone='pending']").color).toBe('var(--color-muted)')
  })
  it('the clock badge is a 14 px circle on --color-surface with a 1 px --color-line ring, at the tick’s lower end corner', () => {
    const d = rule('.list-row__sync-badge')
    expect(d['inline-size']).toBe('14px')
    expect(d['block-size']).toBe('14px')
    expect(d['border-radius']).toMatch(/50%|999px|var\(--radius-chip\)/)
    expect(d.background).toMatch(/var\(--color-surface\)/)
    expect(d['box-shadow']).toMatch(/0 0 0 1px var\(--color-line\)/)
    expect(d.position).toBe('absolute')
  })
})

describe('SSP-03: the ListGroup heading', () => {
  it('a group section is a grid with --space-3 between the heading row and the card', () => {
    expect(rule('.list-group-section')).toMatchObject({ display: 'grid', gap: 'var(--space-3)' })
  })
  it('the sections of one page are --section-gap apart', () => {
    const s = strip(css)
    expect(s).toMatch(/\.list-group-section\s*\+\s*\.list-group-section\s*\{[^}]*(margin-block-start|row-gap|margin-top)\s*:\s*var\(--section-gap\)/)
  })
  it('the heading row is a flex row; the title is the title-3 role, wraps at a word, two lines at most', () => {
    expect(rule('.list-group__header').display).toBe('flex')
    const t = rule('.list-group__title')
    expect(t['font-size']).toBe('var(--text-title-3-size)')
    expect(t['line-height']).toBe('var(--text-title-3-line)')
    expect(t['font-weight']).toBe('var(--text-title-3-weight)')
    expect(t['min-inline-size']).toBe('0')
    const n = rule('.list-group__name')
    expect(n['-webkit-line-clamp']).toBe('2')
    expect(n.overflow).toBe('hidden')
    expect(n['overflow-wrap'] ?? 'normal').not.toBe('anywhere')
  })
  it('the count is a round chip on --color-surface-2 in the text colour (a proper circle for one digit)', () => {
    const c = rule('.list-group__count')
    expect(c['border-radius']).toMatch(/999px|var\(--radius-chip\)|50%/)
    expect(c.background).toMatch(/var\(--color-surface-2\)/)
    expect(c.color).toBe('var(--color-text)')
    expect(c['min-inline-size']).toBeTruthy()
    expect(c['flex'] ?? c['flex-shrink'] ?? 'none').toMatch(/none|0/)
  })
  it('the icon is muted; the action does not shrink', () => {
    expect(rule('.list-group__icon').color).toBe('var(--color-muted)')
    expect(rule('.list-group__action').flex).toMatch(/none|0 0 auto/)
  })
})

describe('SET-12: the neutral Avatar', () => {
  it('a neutral monogram is --color-muted on --color-surface-2 (5.93:1 light, 7.49:1 dark)', () => {
    const d = declarations(avatar, ".avatar[data-tone='neutral']")
    expect(d.background).toMatch(/var\(--color-surface-2\)/)
    expect(d.color).toBe('var(--color-muted)')
  })
  it('the accent fill is still the default', () => {
    expect(declarations(avatar, '.avatar').background).toBe('var(--color-primary)')
  })
})

describe('tokens: the numbers the rules above read exist', () => {
  it('--section-gap and --color-surface-2 are defined', () => {
    const styles = strip(readStylesCss())
    expect(styles).toMatch(/--section-gap:/)
    expect(styles).toMatch(/--color-surface-2:/)
  })
})
