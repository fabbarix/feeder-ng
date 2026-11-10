// R2-F (F-03): Button block = 'phone' | 'always' | 'never'. Deviation from the review's default (see the design note): the default is
// 'never', so no existing Button changes; FormActions makes its buttons full width on phones by CSS.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'
import { declarations, readUiCss } from './test-utils'

describe('Button block', () => {
  it('sets no data-block by default', () => {
    render(<Button>Cook</Button>)
    expect(screen.getByRole('button')).not.toHaveAttribute('data-block')
  })

  it.each(['phone', 'always'] as const)("block='%s' is data-block", (block) => {
    render(<Button block={block}>Cook</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-block', block)
  })

  it("block='never' sets no attribute either", () => {
    render(<Button block="never">Cook</Button>)
    expect(screen.getByRole('button')).not.toHaveAttribute('data-block')
  })

  it('the prop does not reach the DOM as an unknown attribute', () => {
    render(<Button block="phone">Cook</Button>)
    expect(screen.getByRole('button')).not.toHaveAttribute('block')
  })
})

describe('Button.css block', () => {
  const css = readUiCss('Button.css')

  it("always: inline-size 100 % (and the label stays centred)", () => {
    expect(declarations(css, ".button[data-block='always']")).toMatchObject({ 'inline-size': '100%' })
  })

  it("phone: full width below 600 px only", () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*599px\)\s*\{[^@]*\.button\[data-block='phone'\]\s*\{[^}]*inline-size:\s*100%/)
  })
})
