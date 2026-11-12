// TG-RW: CSS contract of the Tag chips (docs/dev/design/tg-rw.md 6): wrapping rows, no colour literals.
import { describe, expect, it } from 'vitest'
import { rulesFor, valueFor } from './rules.test-helper'

describe('Tag chips list', () => {
  it('.recipe-tags is a wrapping flex row with a token gap and no list bullets', () => {
    expect(valueFor('.recipe-tags', 'display', 0)).toBe('flex')
    expect(valueFor('.recipe-tags', 'flex-wrap', 0)).toBe('wrap')
    expect(valueFor('.recipe-tags', 'gap', 0)).toMatch(/^var\(--space-/)
    expect(valueFor('.recipe-tags', 'list-style', 0)).toBe('none')
  })
  it('the editor\'s "New" marker and the suggestion dot are styled', () => {
    expect(rulesFor('.tag-input__new').length).toBeGreaterThan(0)
    expect(rulesFor('.tag-input__suggestion .tag-dot').length).toBeGreaterThan(0)
  })
  it('none of those rules uses a colour literal (colours come from the Tag tokens)', () => {
    for (const sel of ['.recipe-tags', '.tag-input__new', '.tag-input__suggestion .tag-dot']) {
      for (const r of rulesFor(sel)) expect(JSON.stringify(r)).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(/i)
    }
  })
})
