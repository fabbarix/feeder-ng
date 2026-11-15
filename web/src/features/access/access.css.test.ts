// SET-12 / SET-03 (B9-52): the request rows use ListRow's `actions` slot, which already puts the actions on their own line below
// 35 rem and keeps them at the end of the row above it. The page's own phone block is gone, and so is every mid-word wrap: the
// check-ui `word-break` rule (overflow-wrap anywhere/break-word) is clean in this folder.
//   - the slot's Deny and Approve never touch (a gap of --space-2 or more) and may wrap rather than overflow;
//   - the state's warn tone is a token, never the spoil or danger colours (DS-06);
//   - nothing in this stylesheet wraps mid-word, except on a selector that names an email, url, link, barcode or code (the rule's own exemption).
import { describe, expect, it } from 'vitest'
import { rule, stylesheet } from '../../test/cssRules'

const sheet = stylesheet('src/features/access/access.css')

describe('access.css: the request rows (SET-12)', () => {
  it('no longer has its own phone block for the rows: the actions slot does that', () => {
    expect(sheet.phone).not.toContain('.access__list .list-row__trailing')
    expect(sheet.phone).not.toContain('.access__list .list-row[data-height]')
    expect(sheet.css).not.toContain('.access__list .list-row__trailing')
  })

  it('Deny and Approve keep at least 8 px between them (they never touch)', () => {
    const r = rule(sheet.base, '.access__actions')
    expect(r.display).toMatch(/flex/)
    expect(r.gap).toMatch(/var\(--space-(2|3|4)\)/)
  })

  it('the warn tone of the state is drawn from the warn tokens, never spoil or danger', () => {
    const css = sheet.css
    expect(css).not.toMatch(/--color-(spoil|danger)/)
    expect(css).toMatch(/\[data-tone=['"]?warn['"]?\]/)
  })

  it('the bold running error line (.access__error, weight 600) is gone: FormError replaces it', () => {
    expect(rule(sheet.base, '.access__error')).toEqual({})
  })
})

describe('access.css: no mid-word wrapping (word-break rule)', () => {
  it('has no overflow-wrap anywhere or break-word, word-break break-all or hyphens auto, except on an email/url/link/barcode/code selector', () => {
    const offenders: string[] = []
    for (const m of sheet.css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const bad = /(overflow-wrap|word-wrap)\s*:\s*(anywhere|break-word)|word-break\s*:\s*(break-all|break-word)|hyphens\s*:\s*auto/.test(m[2]!)
      if (!bad) continue
      for (const sel of m[1]!.split(',').map((x) => x.trim())) {
        const last = sel.replace(/\s*[>+~]\s*/g, ' ').split(/\s+/).pop() ?? ''
        if (!/email|url|link|barcode|code/i.test(last)) offenders.push(sel)
      }
    }
    expect(offenders).toEqual([])
  })
})

// Review send-back: the approve sheet title held the email and never wrapped (650 px at 390). The email sits in a body line; B9-52
// keeps it from widening the sheet without a mid-word wrap rule (the developer may use the email's own hook class, which the
// word-break rule exempts, or <wbr> breaks).
describe('access.css: the approve sheet body line', () => {
  it('has no .access__wrap rule that breaks anywhere', () => {
    expect(rule(sheet.base, '.access__wrap')['overflow-wrap']).toBeUndefined()
  })
})
