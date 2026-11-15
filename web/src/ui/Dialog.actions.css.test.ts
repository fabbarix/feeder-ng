// w4b (B9-27's Delete dialog at 390): three actions on a phone share each line's width, so the commit is never left alone at the end of
// a ragged second line; two actions keep their natural width.
import { describe, expect, it } from 'vitest'
import { readUiCss } from './test-utils'

describe('Dialog actions on a phone', () => {
  it('a three-action row lets its buttons grow below 37.5em, and only a three-action row', () => {
    const css = readUiCss('Dialog.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const block = /@media \(width < 37\.5em\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
    expect(block).toMatch(/\.dialog__actions:has\(> :nth-child\(3\)\) > \*\s*\{\s*flex: 1 1 auto;/)
  })
})
