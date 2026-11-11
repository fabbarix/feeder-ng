import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// R14b: the disabled create row dims only its label; the reason keeps the muted colour at full opacity (>= 4.5:1).
const css = readFileSync(new URL('./Select.css', import.meta.url), 'utf8')
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`)
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}

describe('Select.css: disabled create row', () => {
  it('does not dim the whole disabled option', () => {
    expect(rule(".select__option--create[aria-disabled='true']")).not.toMatch(/opacity/)
    expect(rule(".select__option:not(.select__option--create)[aria-disabled='true']")).toMatch(/opacity/)
  })
  it('dims the label only, never the meta reason', () => {
    expect(rule(".select__option--create[aria-disabled='true'] .select__label")).toMatch(/opacity/)
    expect(rule(".select__option--create[aria-disabled='true'] .select__meta")).not.toMatch(/opacity/)
  })
})
