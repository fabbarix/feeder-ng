// F-02 CSS contract (jsdom cannot measure layout, so the rules are pinned in the source). Review 2, screens 10 and 11:
// the email field was 83 px wide because it shrank in a flex row, and the phone rows overflowed their card.
//   - .allowlist__add wraps; .allowlist__field grows from a real basis (never 0), may shrink to its own container only
//     (min-inline-size: 0 so a long address cannot push the button out), and is capped on desktop;
//   - at phone width (below 600 px) the field is the full row and the button drops under it;
//   - .allowlist__actions (Switch + Remove) never shrinks or wraps, so the row title is what truncates (the ListRow ellipsis).
import { describe, expect, it } from 'vitest'
import { rule as ruleIn, stylesheet } from '../../test/cssRules'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/settings/settings.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
/** The stylesheet without its @media blocks: the base rules. */
const base = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')

/** Declarations of every top-level rule whose selector list contains `selector` exactly, merged. */
function rule(selector: string, source = base): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of source.matchAll(/(?<=^|\})()\s*([^{}@]+)\{([^{}]*)\}/g)) {
    if (!m[2]!.split(',').map((x) => x.trim()).includes(selector)) continue
    for (const d of m[3]!.split(';')) {
      const i = d.indexOf(':')
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim()
    }
  }
  return out
}

const phoneBlock = (): string => {
  // DS-09 (B9-10): the phone block is `(width < 37.5em)`; max-width 599px is the old spelling (the sweep test bans it).
  const m = css.match(/@media[^{]*(?:max-width:\s*(?:599(?:\.98)?px|37\.4(?:rem|em))|width\s*<\s*37\.5em)[^{]*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/)
  return m?.[1] ?? ''
}

describe('settings.css: the Allowlist add form', () => {
  it('.allowlist__add is a wrapping flex row with a gap', () => {
    const r = rule('.allowlist__add')
    expect(r.display).toBe('flex')
    expect(r['flex-wrap']).toBe('wrap')
    expect(r.gap).toBeTruthy()
  })

  it('.allowlist__field grows from a non-zero basis and may not shrink to nothing', () => {
    const r = rule('.allowlist__field')
    const grow = r.flex ?? ''
    expect(grow, 'flex shorthand').toMatch(/^1\s+1\s+(?!0(px|rem|%)?\b)\S+/) // flex: 1 1 <basis>, basis not 0
    expect(r['min-inline-size']).toBeTruthy()
    expect(r['min-inline-size']).not.toBe('0')
    expect(r['min-inline-size']).not.toMatch(/^0(px|rem)?$/)
  })

  it('.allowlist__field has a desktop cap, so it is not a 1000 px bar', () => {
    const r = rule('.allowlist__field')
    expect(r['max-inline-size']).toMatch(/^\d+(\.\d+)?(rem|px|ch)$/)
  })

  it('at phone width the field is the full row (no cap, 100 % basis)', () => {
    const block = phoneBlock()
    expect(block, 'a (width < 37.5em) media block').not.toBe('')
    const r = rule('.allowlist__field', block)
    expect(`${r.flex ?? ''} ${r['flex-basis'] ?? ''} ${r['inline-size'] ?? ''}`).toMatch(/100%/)
    expect(r['max-inline-size']).toBe('none')
  })

  it('the button does not shrink', () => {
    const r = rule('.allowlist__add > button') ?? {}
    const alt = rule('.allowlist__button')
    expect(`${r.flex ?? ''}${alt.flex ?? ''}${r['flex-shrink'] ?? ''}${alt['flex-shrink'] ?? ''}`).toMatch(/none|\b0\b/)
  })
})

describe('settings.css: Allowlist rows', () => {
  it('.allowlist__actions is a non-wrapping, non-shrinking flex group', () => {
    const r = rule('.allowlist__actions')
    expect(r.display).toMatch(/flex/)
    expect(r['flex-wrap'] ?? 'nowrap').toBe('nowrap')
    expect(r.flex === 'none' || r['flex-shrink'] === '0').toBe(true)
  })

  it('no rule on the Allowlist shrinks a field to a fixed pixel width', () => {
    for (const sel of ['.allowlist__add', '.allowlist__field', '.allowlist__actions']) {
      const r = rule(sel)
      expect(r['inline-size'] ?? '', sel).not.toMatch(/^\d+px$/)
      expect(r.width ?? '', sel).not.toMatch(/^\d+px$/)
    }
  })
})

// Review send-back (390 px): the button floated ~33 px below the field because a more specific base selector
// (`.allowlist__add > .allowlist__button`) beat the phone override, and emails truncated in a ~129 px title.
describe('settings.css: Allowlist at phone width', () => {
  // the phone block as this file reads it (the shared stylesheet() helper still looks for max-width: 599px; DS-09 wrote it in em)
  const sheet = stylesheet('src/features/settings/settings.css')

  it('the button margin comes from ONE selector, so the phone override cannot lose on specificity', () => {
    expect(ruleIn(sheet.base, '.allowlist__add > .allowlist__button')).toEqual({})
    expect(ruleIn(sheet.base, '.allowlist__button')['margin-block-start']).toBeTruthy()
  })

  it('on a phone the button sits directly under the field (margin-block-start 0)', () => {
    expect(ruleIn(phoneBlock(), '.allowlist__button')['margin-block-start']).toMatch(/^0(px)?$/)
    expect(ruleIn(phoneBlock(), '.allowlist__add > .allowlist__button')).toEqual({})
  })

  // B9-52 (SET-03): the Allowlist uses ListRow's `actions` slot and `wrapTitle`; the email wraps only at "@" and "." (<wbr>), ends in an
  // ellipsis after two lines, and never breaks mid-word, so the old phone override that did (`overflow-wrap: anywhere`) is gone.
  it('on a phone the row grows with its two-line title (auto height, a minimum) but the title no longer breaks anywhere', () => {
    const row = ruleIn(phoneBlock(), '.allowlist__list .list-row[data-height]')
    expect(row['block-size'] ?? 'auto').toBe('auto')
    expect(ruleIn(phoneBlock(), '.allowlist__list .list-row__title')['overflow-wrap']).toBeUndefined()
  })

  it('nothing in settings.css wraps mid-word (the check-ui word-break rule): no overflow-wrap anywhere/break-word, word-break break-all, hyphens auto', () => {
    expect(css).not.toMatch(/(overflow-wrap|word-wrap)\s*:\s*(anywhere|break-word)/)
    expect(css).not.toMatch(/word-break\s*:\s*(break-all|break-word)/)
    expect(css).not.toMatch(/hyphens\s*:\s*auto/)
  })

  it('the switch and the icon buttons keep 8 px between them (--space-2)', () => {
    expect(rule('.allowlist__actions').gap).toBe('var(--space-2)')
  })
})
