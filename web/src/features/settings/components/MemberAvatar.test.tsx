import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemberAvatar } from './MemberAvatar'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

describe('MemberAvatar', () => {
  it('is the ui Avatar primitive: named initials with the Member colour as its ring (colour prop)', () => {
    render(<MemberAvatar name="Anna" colour="#3366cc" />)
    const avatar = screen.getByRole('img', { name: 'Anna' })
    expect(avatar).toHaveTextContent('A')
    expect(avatar).toHaveAttribute('data-coloured', 'true')
    expect(avatar.style.getPropertyValue('--avatar-colour')).toBe('#3366cc')
  })

  it('does not copy the primitive\'s markup: no className="avatar" in the component source', () => {
    const src = readFileSync(`${cwd}/src/features/settings/components/MemberAvatar.tsx`, 'utf8')
    expect(src).not.toMatch(/className=["'{`]\s*["'`]?avatar/)
    expect(src).toMatch(/<Avatar\b/)
  })

  it('adds no wrapper that repaints the fill (the avatar is the only styled element)', () => {
    const { container } = render(<MemberAvatar name="Anna" colour="#3366cc" />)
    expect(container.querySelectorAll('.avatar')).toHaveLength(1)
  })

  it('passes the size through', () => {
    render(<MemberAvatar name="Anna" colour="#3366cc" size="lg" />)
    expect(screen.getByRole('img', { name: 'Anna' })).toHaveAttribute('data-size', 'lg')
  })

  // R11a: the Avatar primitive has a glyph slot now; MemberAvatar passes the Member's emoji through it (no hand-rolled markup).
  it('shows the Member\'s emoji avatar through the Avatar primitive, and initials when there is none', () => {
    const { rerender } = render(<MemberAvatar name="Sam" colour="#81b29a" avatar="🦊" />)
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
    rerender(<MemberAvatar name="Sam" colour="#81b29a" avatar="" />)
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('S')
  })
})
