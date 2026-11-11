// Review send-back (390 px): on the Sign-in requests page the row put the avatar, the text and Approve / Deny in one line, so the
// text column shrank to ~55 px (name cut, email overflowing, "asked ... left" over 5 lines), and the Recent activity rows did not
// wrap. jsdom cannot measure layout, so the phone rules are pinned in the source (as F-02 does for the Allowlist).
//   - `.access__list` wraps the ListGroups of the page; below 600 px its rows wrap, the trailing actions take their own line
//     under the text (right-aligned), and title and meta wrap instead of truncating or overflowing.
import { describe, expect, it } from 'vitest'
import { rule, stylesheet } from '../../test/cssRules'

const sheet = stylesheet('src/features/access/access.css')

describe('access.css: phone layout of the request rows', () => {
  it('has a phone block', () => {
    expect(sheet.phone).not.toBe('')
  })

  it('the row wraps, so the actions can drop under the text', () => {
    expect(rule(sheet.phone, '.access__list .list-row')['flex-wrap']).toBe('wrap')
  })

  it('the trailing actions take the whole line under the text, aligned to the end', () => {
    const r = rule(sheet.phone, '.access__list .list-row__trailing')
    expect(`${r.flex ?? ''} ${r['flex-basis'] ?? ''} ${r['inline-size'] ?? ''}`).toMatch(/100%/)
    expect(r['justify-content']).toMatch(/flex-end|end/)
  })

  it('the text column keeps a usable width beside the avatar', () => {
    const r = rule(sheet.phone, '.access__list .list-row__text')
    expect(r['flex-basis'] ?? r.flex ?? '').toMatch(/\d/)
  })

  it('title and meta wrap instead of truncating or overflowing', () => {
    expect(rule(sheet.phone, '.access__list .list-row__title')['white-space']).toBe('normal')
    expect(rule(sheet.phone, '.access__list .list-row__title')['overflow-wrap']).toBe('anywhere')
    expect(rule(sheet.phone, '.access__list .list-row__meta')['overflow-wrap']).toBe('anywhere')
  })

  it('the row grows with its text (auto height, a minimum)', () => {
    const r = rule(sheet.phone, '.access__list .list-row')
    expect(r['block-size']).toBe('auto')
    expect(r['min-block-size']).toBeTruthy()
  })
})
