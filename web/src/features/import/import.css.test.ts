// CSS contract of the import screen that jsdom cannot check: the #read landing, the chosen thumbnail.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

const css = readSource('features/import/import.css').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (selector: string): string => {
  const at = css.indexOf(`${selector} {`)
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}

describe('import.css', () => {
  it('the programmatically focused step headings keep clear of the sticky chrome (scroll-margin) and show no ring', () => {
    const r = rule('.import-screen h2[tabindex=\'-1\']')
    expect(r).toMatch(/scroll-margin-block-start:\s*var\(--/)
    expect(r).toMatch(/outline:\s*none/)
  })
  it('a keyboard-focused heading would still get a ring (focus-visible), the programmatic one not', () => {
    expect(css).toMatch(/import-screen h2\[tabindex='-1'\]:focus-visible/)
  })
  it('the chosen thumbnail has a ring and a check badge, not only a border colour', () => {
    expect(rule(".photo-choice__radio[aria-checked='true']")).toMatch(/box-shadow:/)
    expect(css).toMatch(/\.photo-choice__check\s*\{/)
  })
  it('the removed ReadSourceChoice options have no styles left', () => {
    expect(css).not.toMatch(/read-source__option/)
  })
  it('the chips of an answer row wrap and shrink inside a phone-width Tile instead of clipping (CRS E2)', () => {
    expect(rule('.import-chips')).toMatch(/flex-wrap:\s*wrap/)
    const chip = rule('.import-chips .chip')
    expect(chip).toMatch(/max-inline-size:\s*100%/)
    expect(chip).toMatch(/min-inline-size:\s*0/)
    const status = rule(".import-chips .chip[data-kind='tag']")
    expect(status).toMatch(/white-space:\s*normal/)
    expect(status).toMatch(/block-size:\s*auto/)
    // B9-55 (check-ui word-break fails in import): no mid-word break; a single word too long ends in an ellipsis on the label.
    expect(status).not.toMatch(/overflow-wrap:\s*anywhere/)
    expect(rule('.import-chips .chip__label')).toMatch(/text-overflow:\s*ellipsis/)
  })
  it('answer (filter) chips wrap and grow from the shared 32 px height; keep their hit area (CRS E2)', () => {
    const filter = rule(".import-chips .chip[data-kind='filter']")
    expect(filter).toMatch(/min-block-size:\s*32px/)
    expect(filter).toMatch(/white-space:\s*normal/)
    expect(filter).not.toMatch(/overflow-wrap:\s*anywhere/) // B9-55: word-break; the label ends in an ellipsis instead
    expect(filter).toMatch(/block-size:\s*auto/)
    expect(filter).not.toMatch(/overflow:\s*hidden/)
    expect(filter).not.toMatch(/text-overflow/)
    expect(filter).not.toMatch(/nowrap/)
  })
  // B9-55 (system.md 3, check-ui word-break fails in import): they wrap at a word and a single word too long ends in an ellipsis, never
  // breaking mid-word; either way the page does not scroll sideways (was overflow-wrap: anywhere).
  it('Import Review tile headings and text wrap at a word and end a long single word in an ellipsis (CRS E2)', () => {
    for (const sel of ['.import-review h2', '.import-review p']) {
      expect(rule(sel), sel).not.toMatch(/overflow-wrap:\s*(anywhere|break-word)/)
      expect(rule(sel), sel).toMatch(/text-overflow:\s*ellipsis/)
      expect(rule(sel), sel).toMatch(/overflow:\s*(hidden|clip)/)
    }
  })
})
