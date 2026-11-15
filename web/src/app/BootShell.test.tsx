// B9-49 (RES-08): <BootShell/> is what AppRoot returns while /api/me is pending (instead of a bare "Loading"). It is the markup and classes
// of index.html's skeleton (so React replaces it without a jump), one role="status" named "Opening Feeder", its blocks aria-hidden.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BootShell } from './BootShell'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const html = readFileSync(`${cwd}/index.html`, 'utf8')

describe('BootShell', () => {
  it('is one polite-busy status named "Opening Feeder", with no "Loading" text', () => {
    render(<BootShell />)
    const status = screen.getByRole('status', { name: 'Opening Feeder' })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveClass('boot-shell')
    expect(screen.queryByText('Loading')).toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('draws the top bar, seven rail pills, a title pill, two tiles and the bar outline; the page blocks are aria-hidden', () => {
    const { container } = render(<BootShell />)
    for (const c of ['boot-shell__top', 'boot-shell__brand', 'boot-shell__avatar', 'boot-shell__rail', 'boot-shell__page', 'boot-shell__title', 'boot-shell__bar']) {
      expect(container.querySelector(`.${c}`), c).not.toBeNull()
    }
    expect(container.querySelectorAll('.boot-shell__rail > span')).toHaveLength(7)
    expect(container.querySelectorAll('.boot-shell__tile')).toHaveLength(2)
    for (const c of ['boot-shell__rail', 'boot-shell__page', 'boot-shell__bar']) expect(container.querySelector(`.${c}`), c).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses exactly the classes index.html draws (the same markup, so no jump when React takes over)', () => {
    const { container } = render(<BootShell />)
    const used = new Set([...container.querySelectorAll('[class]')].flatMap((e) => [...e.classList]))
    const inHtml = new Set([...html.matchAll(/class="([^"]*boot-shell[^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/)))
    expect([...used].sort()).toEqual([...inHtml].sort())
  })
})
