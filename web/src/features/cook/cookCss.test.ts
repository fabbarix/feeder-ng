// R11b N8: on the phone the Step tile follows its content (screenshot 05: a big empty area under a one-line Step).
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/cook/cook.css`, 'utf8')

const mediaAt = css.indexOf('@media (min-width: 768px)')
const phoneCss = mediaAt < 0 ? css : css.slice(0, mediaAt)
const tabletCss = mediaAt < 0 ? '' : css.slice(mediaAt)

const rule = (text: string, selector: string) => {
  const start = text.indexOf(`${selector} {`)
  return start < 0 ? '' : text.slice(start, text.indexOf('}', start) + 1)
}

describe('cook.css Step tile height (N8)', () => {
  it('the phone Step tile has no minimum height (no 40vh block)', () => {
    const r = rule(phoneCss, '.cook-step')
    expect(r).not.toBe('')
    expect(r).not.toMatch(/min-(height|block-size)/)
    expect(phoneCss).not.toMatch(/\.cook-step\s*\{[^}]*\b\d+vh/)
  })
  it('the tablet keeps the tile filling the height (flex grow)', () => {
    expect(rule(tabletCss, '  .cook-step').replace(/\s+/g, ' ')).toMatch(/flex:\s*1 0 auto/)
  })
})
