// A11Y-12: the TextArea has no native resize grip (CLAUDE.md: no native browser UI), starts at 3 lines and grows with its text up to
// 12 lines. `field-sizing: content` where supported; useAutoGrow elsewhere.
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { declarations, readUiCss } from '../test-utils'
import { TextArea } from './TextArea'

describe('TextArea.css', () => {
  const raw = readUiCss('fields/Field.css')
  const norm = (s: string) => s.replace(/\s+/g, ' ')

  it('has no resize grip', () => {
    expect(declarations(raw, '.ui-field__textarea')['resize']).toBe('none')
  })

  it('where field-sizing: content is supported the field grows by itself, from 3 lines to 12', () => {
    const m = /@supports\s*\(field-sizing:\s*content\)\s*\{([\s\S]*?\})\s*\}/.exec(raw)
    expect(m, 'an @supports (field-sizing: content) block').not.toBeNull()
    const block = norm(m![1]!)
    expect(block).toMatch(/\.ui-field__textarea\s*\{/)
    expect(block).toMatch(/field-sizing:\s*content/)
    expect(block).toMatch(/min-block-size:\s*calc\(/)
    expect(block).toMatch(/max-block-size:\s*calc\(/)
    expect(block).toMatch(/overflow-y:\s*auto/)
  })
})

describe('TextArea', () => {
  let scrollHeight = 0
  beforeEach(() => {
    scrollHeight = 180
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight })
    vi.stubGlobal('CSS', { supports: () => false })
  })
  afterEach(() => {
    delete (HTMLTextAreaElement.prototype as { scrollHeight?: unknown }).scrollHeight
    vi.unstubAllGlobals()
  })

  it('still starts at 3 rows', () => {
    render(<TextArea label="Notes" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Notes')).toHaveAttribute('rows', '3')
  })

  it('grows with its text through useAutoGrow (inline height from scrollHeight)', () => {
    render(<TextArea label="Notes" value={'line\n'.repeat(8)} onChange={() => {}} />)
    expect(screen.getByLabelText('Notes').style.height).toBe('180px')
  })

  it('takes maxRows, default 12 (20 px lines and 12 px padding give 264 px, or 104 px for 4 rows)', () => {
    scrollHeight = 5000
    const style = { lineHeight: '20px', paddingTop: '12px', paddingBottom: '12px' }
    const { rerender } = render(<TextArea label="Notes" value="x" style={style} onChange={() => {}} />)
    expect(screen.getByLabelText('Notes').style.height).toBe('264px')
    rerender(<TextArea label="Notes" value="x" maxRows={4} style={style} onChange={() => {}} />)
    expect(screen.getByLabelText('Notes').style.height).toBe('104px')
  })
})
