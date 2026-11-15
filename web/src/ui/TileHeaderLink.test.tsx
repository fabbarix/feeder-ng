// B9-44 (TB-09): the trailing link of a TileHeader ("Pantry ›"). It navigates rather than acts, so it stays a link and reads as one (R-A allows it):
// underlined text (1 px, 3 px offset, 2 px on hover) and a caret-right, a 44 px target, no button fill. New component ui/TileHeaderLink.tsx, exported
// from `ui`, for the Use soon, Leftovers and Throw out or keep? tiles (`<TileHeader action={<TileHeaderLink to label context />} />`).
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { TileHeaderLink } from './TileHeaderLink'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('TileHeaderLink.css').replace(/\/\*[\s\S]*?\*\//g, '')
const view = () =>
  render(
    <MemoryRouter>
      <TileHeaderLink to="/pantry?status=useSoon" label="Pantry" context="Use soon" />
    </MemoryRouter>,
  )

describe('TileHeaderLink', () => {
  it('is an a to the path, with the visible text "Pantry" and the accessible name "Pantry, Use soon"', () => {
    view()
    const link = screen.getByRole('link', { name: 'Pantry, Use soon' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/pantry?status=useSoon')
    expect(link).toHaveTextContent('Pantry')
    expect(link).toHaveClass('tile-header__link')
  })

  it('has a decorative caret-right after the text', () => {
    view()
    const link = screen.getByRole('link')
    const svg = link.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('is not a button: no button class, no data-variant', () => {
    view()
    const link = screen.getByRole('link')
    expect(link).not.toHaveClass('button')
    expect(link).not.toHaveAttribute('data-variant')
  })
})

describe('TileHeaderLink.css', () => {
  const d = declarations(css, '.tile-header__link')
  it('underlines its text, 1 px thick and 3 px off, and has no fill', () => {
    expect(d['text-decoration-line'] ?? d['text-decoration']).toMatch(/underline/)
    expect(d['text-decoration-thickness']).toBe('1px')
    expect(d['text-underline-offset']).toBe('3px')
    expect(d['background'] ?? d['background-color'] ?? 'transparent').toMatch(/^(none|transparent)$/)
  })
  it('is 2 px thick on hover', () => {
    expect(declarations(css, '.tile-header__link:hover')['text-decoration-thickness']).toBe('2px')
  })
  it('is a 44 px target', () => {
    expect(d['min-block-size']).toMatch(/44px|var\(--target-min\)|var\(--touch-target\)/)
  })
  it('puts the caret beside the text on one line', () => {
    expect(d['display']).toMatch(/inline-flex|flex/)
    expect(d['white-space']).toBe('nowrap')
  })
})
