// CRS F review (spec 7.5, 11), B9-47 (TB-07): the hero is read from across the kitchen, so its Course rows keep a legible scale, now in the
// board roles. The main Course's row is at the hero role (it is the Recipe name of a several-Course hero); the other rows are --text-board-title,
// never below the slot line (--text-board-meta); a Cooked row is muted. The full board.css contract is boardCss.b9-47.test.ts.
import { describe, expect, it } from 'vitest'
import { bodyOf } from './cssRules'

const size = (selector: string) => /(?:^|[;\s])font-size:\s*([^;]+)/.exec(bodyOf(selector))?.[1]?.trim()

describe('board.css: the hero\'s Course rows', () => {
  it('the main Course row is the hero role, the other rows the title role, the slot line the meta role', () => {
    expect(size('.board-tonight__recipe')).toBe('var(--text-board-hero)')
    expect(size(".board-tonight__course[data-main='true']")).toBe('var(--text-board-hero)')
    expect(size('.board-tonight__course')).toBe('var(--text-board-title)')
    expect(size('.board-tonight__slot')).toBe('var(--text-board-meta)')
  })

  // B9-08 (TB-05): the hero no longer redefines --color-muted, so a Cooked row is the hero text colour at 70 %, never an opacity fade.
  it('a Cooked row is muted: the hero text colour at 70 %, no opacity', () => {
    const r = bodyOf(".board-tonight__course[data-state='cooked']")
    expect(r).toMatch(/color:\s*color-mix\(in srgb, currentColor 70%, transparent\)/)
    expect(r).not.toMatch(/opacity/)
  })
})
