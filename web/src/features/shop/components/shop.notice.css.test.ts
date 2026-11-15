// B9-43 (SSP-04; mocks/ssp-04-notice.html "Rules"): the notice's CSS. The two-line clamp moves from the whole sentence to the slots line;
// the title is never clamped or cut. Mark it sits under the text while the tile is narrower than 26 rem (a container query on the notice)
// and at the end from 26 rem.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/shop/shop.css`, 'utf8')
const rule = (selector: string): string => {
  const out: string[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (m[1]!.split(',').some((s) => s.trim() === selector)) out.push(m[2]!)
  }
  return out.join('\n')
}

describe('shop.css: the notice (SSP-04)', () => {
  it('the slots line clamps to two lines', () => {
    const slots = rule('.shop-notice__slots')
    expect(slots).toMatch(/-webkit-line-clamp:\s*2/)
    expect(slots).toMatch(/overflow:\s*hidden/)
  })

  it('the title is never clamped, hidden or ellipsized (the verb is never cut)', () => {
    const title = rule('.shop-notice__title')
    expect(title).not.toMatch(/line-clamp|text-overflow|overflow:\s*hidden|white-space:\s*nowrap/)
  })

  it('the old clamp on the whole text block is gone', () => {
    expect(rule('.shop-notice__text')).not.toMatch(/line-clamp/)
  })

  it('the notice is a size container; at 26 rem Mark it moves to the end', () => {
    expect(rule('.shop-notice')).toMatch(/container-type:\s*inline-size/)
    expect(css).toMatch(/@container[^{]*\(min-width:\s*26rem\)/)
  })

  it('the count chip has its own rule on the surface fill with the info text colour', () => {
    const count = rule('.shop-notice__count')
    expect(count).toMatch(/background:\s*var\(--color-surface\)/)
    expect(count).toMatch(/color:\s*var\(--color-info-fg\)/)
  })

  it('the title is body-strong and the slots are the meta role', () => {
    expect(rule('.shop-notice__title')).toMatch(/--text-body-strong/)
    expect(rule('.shop-notice__slots')).toMatch(/--text-meta/)
  })
})
