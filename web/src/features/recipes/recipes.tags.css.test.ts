// TG-RW: CSS contract of the Tag chips (docs/dev/design/tg-rw.md 6): wrapping rows, no colour literals.
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../theme/color'
import { readSource } from '../plan/test-css'
import { rulesFor, valueFor } from './rules.test-helper'

describe('Tag chips list', () => {
  it('.recipe-tags is a wrapping flex row with a token gap and no list bullets', () => {
    expect(valueFor('.recipe-tags', 'display', 0)).toBe('flex')
    expect(valueFor('.recipe-tags', 'flex-wrap', 0)).toBe('wrap')
    expect(valueFor('.recipe-tags', 'gap', 0)).toMatch(/^var\(--space-/)
    expect(valueFor('.recipe-tags', 'list-style', 0)).toBe('none')
  })
  // B9-37 (RX-09): the Tag field is the Tag chooser; its rows are the shared OptionList's (dot, name, count), so only "New" is the editor's.
  it('the editor\'s "New" marker is styled', () => {
    expect(rulesFor('.tag-chooser__new').length).toBeGreaterThan(0)
  })
  it('none of those rules uses a colour literal (colours come from the Tag tokens)', () => {
    for (const sel of ['.recipe-tags', '.tag-chooser__new']) {
      for (const r of rulesFor(sel)) expect(JSON.stringify(r)).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(/i)
    }
  })
})

describe('the "New" marker on a neutral chip', () => {
  const styles = readSource('styles.css')
  const block = (open: RegExp): Record<string, string> => {
    const start = open.exec(styles)
    expect(start).not.toBeNull()
    const body = styles.slice(start!.index + start![0].length, styles.indexOf('}', start!.index))
    return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]))
  }
  const light = block(/:root,\s*\[data-scheme='light'\]\s*\{/)
  const dark = block(/^\[data-scheme='dark'\]\s*\{/m)
  const chipCss = readSource('ui/Chip.css')
  const token = (text: string | undefined) => /var\((--[\w-]+)\)/.exec(text ?? '')?.[1] ?? ''
  const neutralBg = token(/\.chip\[data-kind='tag'\]\s*\{[^}]*background:\s*([^;]+);/.exec(chipCss)?.[1])
  const newFg = token(valueFor('.tag-chooser__new', 'color', 0))

  it('uses a colour token on the neutral Tag chip (not the accent fill)', () => {
    expect(neutralBg).toBe('--color-surface-2')
    expect(newFg).toMatch(/^--color-/)
    expect(newFg).not.toBe('--color-on-accent')
  })
  it.each([['light', light], ['dark', dark]])('reaches 4.5:1 on the neutral chip in the %s scheme', (_name, scheme) => {
    expect(scheme[newFg]).toBeDefined()
    expect(scheme[neutralBg]).toBeDefined()
    expect(contrastRatio(scheme[newFg]! as never, scheme[neutralBg]! as never)).toBeGreaterThanOrEqual(4.5)
  })
})
