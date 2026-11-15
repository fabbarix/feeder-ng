import { describe, expect, it } from 'vitest'
import { declarations } from '../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const read = (p: string) => {
  try {
    return readFileSync(`${cwd}/${p}`, 'utf8')
  } catch {
    return ''
  }
}
const css = read('src/app/TileErrorBoundary.css')

// B9-20 (RES-09): the crashed-tile notice keeps the tile's slot: surface, a 1 px line, the tile radius, at least 96 px tall.
describe('TileErrorBoundary.css', () => {
  it('the stylesheet exists and the component imports it', () => {
    expect(css.length).toBeGreaterThan(0)
    expect(read('src/app/TileErrorBoundary.tsx')).toMatch(/import ['"]\.\/TileErrorBoundary\.css['"]/)
  })
  it('.tile-error is a surface with a line border, the tile radius and a 96 px minimum height', () => {
    const d = declarations(css, '.tile-error')
    expect(d['background']).toBe('var(--color-surface)')
    expect(d['border']).toBe('1px solid var(--color-line)')
    expect(d['border-radius']).toBe('var(--radius-tile)')
    expect(d['min-block-size']).toBe('96px')
  })
  it('the icon is the danger foreground', () => {
    expect(declarations(css, '.tile-error__icon')['color']).toBe('var(--status-danger-fg)')
  })
  it('no raw colours', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
})
