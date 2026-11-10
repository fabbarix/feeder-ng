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

  // FOLLOW-UP (Avatar primitive request): an emoji avatar needs primitive support (e.g. Avatar `glyph?: string` shown
  // instead of initials). Until then MemberAvatar shows initials and ignores `avatar`; it must not hand-roll markup.
  it.todo('shows the Member\'s emoji avatar through the Avatar primitive once it supports a glyph')
})
