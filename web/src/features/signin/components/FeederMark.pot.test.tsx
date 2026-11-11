// LG: the Family Pot mark on the sign-in page and on the Access Request ("Waiting for approval") page.
// Placement: centred above the title, inside the hero Tile, 48 px, drawn in the one-colour (mono) art with
// currentColor = the hero's text colour (--color-on-accent), so it follows light and dark with no per-scheme art.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { WaitingPage } from '../../access/components/WaitingPage'
import { FeederMark } from './FeederMark'
import { SignInPage } from './SignInPage'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // web/

describe('FeederMark (Family Pot, mono)', () => {
  it('is an SVG image named "Feeder" through its <title>', () => {
    render(<FeederMark />)
    const mark = screen.getByRole('img', { name: 'Feeder' })
    expect(mark.tagName.toLowerCase()).toBe('svg')
    expect(mark.querySelector('title')?.textContent).toBe('Feeder')
  })
  it('is the pot art: the 512 box of master/mark-mono.svg with its #symbol group, not the old plate and fork', () => {
    const { container } = render(<FeederMark />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('viewBox', '0 0 512 512')
    expect(svg.querySelector('g#symbol')).not.toBeNull()
    expect(svg.querySelector('circle')).toBeNull()
  })
  it('is modest: 48 px, and filled with currentColor only (no hex, so dark mode needs nothing)', () => {
    const { container } = render(<FeederMark />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('width', '48')
    expect(svg).toHaveAttribute('height', '48')
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(svg.querySelector('path')).toHaveAttribute('fill', 'currentColor')
  })
  it('takes the hero text colour from tokens in signin.css', () => {
    const css = readFileSync(`${cwd}/src/features/signin/signin.css`, 'utf8')
    expect(css).toMatch(/\.signin__mark\s*\{[^}]*color:\s*var\(--color-on-accent\)/)
    expect(css).not.toMatch(/\.signin__mark\s*\{[^}]*#[0-9a-f]{3,8}/i)
  })
})

describe('the mark on the signed-out pages', () => {
  const potMark = (c: HTMLElement) => {
    const mark = within(c).getByRole('img', { name: 'Feeder' })
    expect(mark.querySelector('g#symbol')).not.toBeNull()
    return mark
  }
  it('the sign-in page shows the Family Pot above the title', () => {
    const { container } = render(<SignInPage />)
    const mark = potMark(container)
    const title = screen.getByRole('heading', { level: 1 })
    expect(mark.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it.each([
    ['waiting', { status: 'pending' as const, email: 'zia@example.test', name: 'Zia' }],
    ['waiting', { status: 'none' as const }],
    ['limited', undefined],
    ['full', undefined],
  ] as const)('the Access Request page (%s) shows the Family Pot above the title', (kind, status) => {
    const { container } = render(
      <MemoryRouter>
        <WaitingPage kind={kind} status={status} />
      </MemoryRouter>,
    )
    const mark = potMark(container)
    const title = screen.getByRole('heading', { level: 1 })
    expect(mark.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
