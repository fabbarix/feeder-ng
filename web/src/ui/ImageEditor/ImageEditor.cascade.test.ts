// Hotfix 4.2 (bug 1, root cause): the editor lives inside the Read step's Tile, and Tile.css has
//   .tile :is(button, a):not(.tile__stretch):not(.list-row__target) { position: relative; z-index: 1 }   (specificity 0,3,1)
// The editor's box and handles are <button>s whose own rule `.crop-editor__handle { position: absolute }` (0,1,0) LOSES to it: the handles
// became position: relative, stacked in normal flow (44 px apart) and then shifted by their inset percentages. x looks right (all start at the
// left edge), y is scattered, and the lower handles land below the editor. The editor's positioning must win over any host rule.
import { describe, expect, it } from 'vitest'
import { readUiCss } from '../test-utils'

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const editorCss = strip(readUiCss('ImageEditor/ImageEditor.css'))
const tileCss = strip(readUiCss('Tile.css'))

/** Specificity (a, b, c) of one selector: ids, classes / attributes / pseudo-classes, elements; :is/:not take their most specific argument, :where counts 0. */
function specificity(selector: string): [number, number, number] {
  let a = 0, b = 0, c = 0
  const add = (s: [number, number, number]) => { a += s[0]; b += s[1]; c += s[2] }
  let rest = selector
  rest = rest.replace(/:(is|not|has)\(([^()]*)\)/g, (_m, _fn, inner: string) => {
    const best = inner.split(',').map((p) => specificity(p.trim())).sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]).pop() ?? [0, 0, 0]
    add(best)
    return ' '
  })
  rest = rest.replace(/:where\([^()]*\)/g, ' ')
  a += (rest.match(/#[\w-]+/g) ?? []).length
  b += (rest.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length
  c += (rest.replace(/\[[^\]]*\]/g, '').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length
  return [a, b, c]
}
const gt = (x: [number, number, number], y: [number, number, number]) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]

/** The selectors of every rule in `source` whose body sets `position`. */
const positioning = (source: string) =>
  [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /(^|[;\s])position\s*:/.test(m[2]!)).flatMap((m) => topLevelList(m[1]!))

/** A selector list split at the commas that are not inside parentheses (":is(button, a)" stays whole). */
function topLevelList(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of list) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  return [...out, cur.trim()].filter(Boolean)
}

describe('the editor keeps its absolute positioning inside a Tile', () => {
  const hostRule = positioning(tileCss).find((s) => s.includes(':is(button, a)'))
  const wins = (own: string) => {
    const selectors = positioning(editorCss).filter((s) => s.includes(own))
    expect(selectors.length, `a position rule for ${own}`).toBeGreaterThan(0)
    return selectors
  }

  it('the Tile still has its "inner controls sit above the stretched target" rule (the premise of this test)', () => {
    expect(hostRule).toBeDefined()
  })

  for (const own of ['.crop-editor__handle', '.crop-editor__box']) {
    it(`${own}: its position rule is more specific than the Tile's button rule (${'0,3,1'}), so it stays absolute`, () => {
      const host = specificity(hostRule!)
      for (const selector of wins(own)) expect(gt(specificity(selector), host), `${selector} ${specificity(selector)} vs ${hostRule} ${host}`).toBeGreaterThan(0)
    })
  }
})
