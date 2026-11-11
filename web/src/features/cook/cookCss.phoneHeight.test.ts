// R2-4 L-08: on the phone the Cook page fills the screen: the Step tile takes the free height and Back/Next stay pinned at the
// bottom (tap zones), instead of floating mid-screen and moving with each Step. The tablet rules stay as R11b N8 pinned them.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/cook/cook.css`, 'utf8')

const mediaAt = css.indexOf('@media (min-width: 768px)')
const phone = mediaAt < 0 ? css : css.slice(0, mediaAt)
const rule = (text: string, selector: string) => {
  const start = text.indexOf(`${selector} {`)
  return start < 0 ? '' : text.slice(start, text.indexOf('}', start) + 1).replace(/\s+/g, ' ')
}

describe('cook.css phone layout (L-08)', () => {
  it('the Cook screen is a column at least one dynamic viewport high', () => {
    const r = rule(phone, '.cook-screen')
    expect(r).toMatch(/min-(block-size|height):\s*100dvh/)
    expect(r).toMatch(/display:\s*flex/)
    expect(r).toMatch(/flex-direction:\s*column/)
  })
  it('the Step tile takes the free height on the phone (flex grow, not a vh minimum)', () => {
    const r = rule(phone, '.cook-step')
    expect(r).toMatch(/flex:\s*1 0 auto/)
    expect(r).not.toMatch(/min-(height|block-size)/)
  })
  it('the Back/Next row sticks to the bottom, clear of the safe area, on an opaque background', () => {
    const r = rule(phone, '.cook-nav')
    expect(r).toMatch(/position:\s*sticky/)
    expect(r).toMatch(/(bottom|inset-block-end):\s*0/)
    expect(r).toMatch(/padding-block-end:\s*calc\([^)]*env\(safe-area-inset-bottom\)/)
    expect(r).toMatch(/background:\s*var\(--color-bg\)/)
    expect(r).toMatch(/z-index:\s*\d/)
  })
  it('keeps the large tap height of the Back/Next tiles', () => {
    expect(rule(phone, '.cook-nav__tile')).toMatch(/min-height:\s*64px/)
  })
})
