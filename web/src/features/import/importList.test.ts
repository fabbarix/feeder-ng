// The error and warning lists of the Import screen are Bento lists: no browser bullets or indent.
import { describe, expect, it } from 'vitest'
import { declarations } from '../../ui/test-utils'
import { readSource } from '../plan/test-css'

describe('import.css: .import-list', () => {
  const css = readSource('features/import/import.css')
  it('has no list marker and no browser indent', () => {
    const d = declarations(css, '.import-list')
    expect(d['list-style']).toBe('none')
    expect(d['padding']).toMatch(/^0/)
  })
  it('the tag chip comment says answer chips wrap too', () => {
    expect(css).not.toMatch(/Only the status chip/)
  })
})
