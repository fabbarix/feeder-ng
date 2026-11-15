// SET-07 (B9-16): a field's size caps its CONTROL, not its frame, so the layout probe's P4 width is the control's (the frame's child
// that holds the input), not the frame's (which now spans the error and helper). The probe runs here in jsdom with layout stubbed:
// each element's box comes from its data-w attribute.
import { afterEach, describe, expect, it } from 'vitest'

const nodeModule = 'node:module'
const { createRequire } = (await import(/* @vite-ignore */ nodeModule)) as { createRequire: (u: string) => (p: string) => unknown }
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const req = createRequire(resolve(cwd, 'package.json'))
const api = req(resolve(cwd, '../scripts/lib/page-layout-rules.mjs')) as {
  PROBES: { name: string; key: string | null; source: string }[]
  evaluateMetrics: (m: unknown, c: { width: number; route: string; kind: string }) => { rule: string; message: string }[]
}
const layout = api.PROBES.find((p) => p.name === 'layout')!

const original = Element.prototype.getBoundingClientRect
afterEach(() => {
  Element.prototype.getBoundingClientRect = original
  document.body.innerHTML = ''
})

function runProbe(html: string) {
  document.body.innerHTML = html
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const w = Number(this.getAttribute('data-w') ?? 100)
    return { x: 16, y: 0, left: 16, top: 0, width: w, height: 40, right: 16 + w, bottom: 40, toJSON: () => ({}) } as DOMRect
  }
  // The text checks of the probe read line boxes through a Range, which jsdom does not lay out: no lines.
  const proto = Range.prototype as unknown as { getClientRects?: () => DOMRect[] }
  if (!proto.getClientRects) proto.getClientRects = () => []
  return new Function(`return (${layout.source})`)() as { fields: { label: string; w: number; size: string; short: boolean }[] }
}

const field = (size: string, frameW: number, controlW: number, label: string) => `
  <div class="ui-field" data-size="${size}" data-w="${frameW}">
    <label class="ui-field__label" for="${label}" data-w="${frameW}">${label}</label>
    <span class="ui-field__control" data-w="${controlW}"><input id="${label}" inputmode="numeric" aria-label="${label}" data-w="${controlW - 20}"></span>
    <p class="ui-field__error" data-w="${frameW}">An error as wide as the field's track</p>
  </div>`

describe('layout probe: P4 measures a field control (SET-07)', () => {
  it('reports the control width, not the full-width frame', () => {
    const m = runProbe(`<main data-w="1200">${field('xs', 800, 136, 'Servings')}</main>`)
    expect(m.fields).toEqual([expect.objectContaining({ label: 'Servings', size: 'xs', short: true, w: 136 })])
  })

  it('still reports a control that is too wide, and P4 finds it at 1440', () => {
    const m = runProbe(`<main data-w="1200">${field('xs', 800, 136, 'Servings')}${field('md', 800, 400, 'Weight')}</main>`)
    expect(m.fields.map((f) => [f.label, f.w])).toEqual([['Servings', 136], ['Weight', 400]])
    const p4 = api.evaluateMetrics({ ...m, fields: m.fields }, { width: 1440, route: '/settings/household', kind: 'default' }).filter((f) => f.rule === 'P4')
    expect(p4.map((f) => f.message)).toEqual(['P4 short field "Weight" is 400px wide (max 240; set size="xs|sm")'])
  })

  it('a field outside a .ui-field frame is measured by its own [data-size] box, as before', () => {
    const m = runProbe(`<main data-w="1200"><div data-size="sm" data-w="180"><input inputmode="numeric" aria-label="Loose" data-w="170"></div></main>`)
    expect(m.fields[0]).toEqual(expect.objectContaining({ label: 'Loose', w: 180 }))
  })
})
