// R11b N8: phone Today layout contract (jsdom does not lay out): the streak tile hugs its content.
import { describe, expect, it } from 'vitest'
import { readFeatureCss } from './test-css'

const css = readFeatureCss('today.css')

describe('today.css streak tile (N8)', () => {
  it('.today-streak aligns to the start of its grid row instead of stretching', () => {
    const start = css.indexOf('.today-streak')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(css.slice(start, css.indexOf('}', start))).toMatch(/align-self:\s*start/)
  })
})
