// CLAUDE.md "No native browser UI" for this feature folder: no native control, no browser dialog, no legacy Chip/Tile/Button
// props, no raw colours, no hand-drawn icons. The shared primitives in web/src/ui own all of that.
import { describe, expect, it } from 'vitest'
import { readFeatureCss } from './test-css'

const raw = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.*', '!./test-utils.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const files = Object.entries(raw).map(([p, text]) => ({ rel: p.replace(/^\.\//, ''), text: strip(text) }))
const code = files
const css = [{ rel: 'plan.css', text: strip(readFeatureCss('plan.css')) }]

describe('no native browser UI in features/plan', () => {
  it('never uses <select>, <input>, <textarea>, alert, confirm or prompt', () => {
    for (const f of code) {
      expect(f.text, f.rel).not.toMatch(/<(select|input|textarea)[\s>/]/)
      expect(f.text, f.rel).not.toMatch(/(^|[^.\w])(window\.)?(alert|confirm|prompt)\(/m)
    }
  })

  it('uses no deprecated primitive props: Chip tone, Tile size/tone/onClick, Button tonal/ghost, EmptyState illustration', () => {
    for (const f of code) {
      expect(f.text, f.rel).not.toMatch(/<Chip[^>]*\stone=/)
      expect(f.text, f.rel).not.toMatch(/<Tile[^>]*\s(size|tone|onClick)=/)
      expect(f.text, f.rel).not.toMatch(/variant="(tonal|ghost)"/)
      expect(f.text, f.rel).not.toMatch(/<EmptyState[^>]*\sillustration=/)
    }
  })

  it('draws no icons of its own and imports none from outside ui/Icon', () => {
    for (const f of code) {
      expect(f.text, f.rel).not.toMatch(/<svg[\s>]/)
      expect(f.text, f.rel).not.toMatch(/@phosphor-icons/)
    }
  })

  it('CSS uses tokens only: no hex or rgb colours, no fixed min-height, no native control selectors', () => {
    for (const f of css) {
      expect(f.text, f.rel).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(f.text, f.rel).not.toMatch(/\brgba?\(/)
      expect(f.text, f.rel).not.toMatch(/\bmin-height:\s*\d/)
      expect(f.text, f.rel).not.toMatch(/(^|[\s,])(select|input|textarea)[\s,{[:.]/m)
    }
  })
})
