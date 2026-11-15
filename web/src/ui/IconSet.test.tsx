// A11Y-09 (B9-16): `ui/IconSet`, the row of icon actions on a Plan row, a slot header or a Course row. Its gap is --icon-set-gap
// (8 px on a fine pointer so a 5 px focus ring stops 3 px short of its neighbour; 12 px on a coarse one so 32 px buttons are a 44 px
// pitch). Neighbouring icon buttons never overlap hit areas and never touch rings.
// API: <IconSet label?={string} className?>{children}</IconSet> renders <div class="icon-set" role="group"?>.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconButton } from './IconButton'
import { IconSet } from './IconSet'
import { declarations, readStylesCss, readUiCss } from './test-utils'

describe('IconSet markup', () => {
  it('renders its children inline in one .icon-set element', () => {
    const { container } = render(
      <IconSet>
        <IconButton icon="more" label="More for Pasta" size="compact" />
        <IconButton icon="pin" label="Pin Pasta" size="compact" />
      </IconSet>,
    )
    const set = container.querySelector('.icon-set')!
    expect(set).not.toBeNull()
    expect(set.children).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Pin Pasta' }).parentElement).toBe(set)
  })

  it('has no role of its own without a label (the buttons carry their own names)', () => {
    const { container } = render(
      <IconSet>
        <IconButton icon="more" label="More" size="compact" />
      </IconSet>,
    )
    expect(container.querySelector('.icon-set')).not.toHaveAttribute('role')
  })

  it('with a label it is a group of that name', () => {
    render(
      <IconSet label="Actions for Pasta">
        <IconButton icon="more" label="More" size="compact" />
      </IconSet>,
    )
    expect(screen.getByRole('group', { name: 'Actions for Pasta' })).toBeInTheDocument()
  })

  it('merges a class name', () => {
    const { container } = render(
      <IconSet className="plan-row__actions">
        <IconButton icon="more" label="More" size="compact" />
      </IconSet>,
    )
    expect(container.querySelector('.icon-set')).toHaveClass('icon-set', 'plan-row__actions')
  })

  it('ignores a null child (an action that is not there) without a stray gap element', () => {
    const { container } = render(
      <IconSet>
        {null}
        <IconButton icon="more" label="More" size="compact" />
        {false}
      </IconSet>,
    )
    expect(container.querySelector('.icon-set')!.children).toHaveLength(1)
  })
})

describe('IconSet.css', () => {
  const css = readUiCss('IconSet.css')
  it('lays the buttons out inline with the set gap, and never lets the set shrink', () => {
    const d = declarations(css, '.icon-set')
    expect(d['display']).toBe('inline-flex')
    expect(d['flex']).toBe('none')
    expect(d['align-items']).toBe('center')
    expect(d['gap']).toBe('var(--icon-set-gap)')
  })

  it('takes its gap from the token, never a raw length', () => {
    expect(css).not.toMatch(/gap:\s*\d/)
  })
})

describe('--icon-set-gap token', () => {
  const styles = readStylesCss()
  it('is 8 px (--space-2) on a fine pointer and 12 px (--space-3) on a coarse one', () => {
    expect(declarations(styles, ':root')['--icon-set-gap']).toBe('var(--space-2)')
    expect(/@media\s*\(pointer:\s*coarse\)\s*\{\s*:root\s*\{[^}]*--icon-set-gap:\s*var\(--space-3\)/.test(styles.replace(/\s+/g, ' '))).toBe(true)
  })
})
