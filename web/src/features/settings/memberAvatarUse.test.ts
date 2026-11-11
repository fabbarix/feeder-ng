// IM2: every place in Settings that draws a Member's avatar hands over the photo too, or a Member's photo would show in some
// lists and not in others.
import { describe, expect, it } from 'vitest'

const raw = import.meta.glob(['./**/*.tsx', '!./**/*.test.*', '!./components/MemberAvatar.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('Settings: <MemberAvatar> callers', () => {
  it('pass photo= next to avatar=', () => {
    const calls = Object.entries(raw).flatMap(([file, text]) => [...text.matchAll(/<MemberAvatar\b[^>]*>/g)].map((m) => ({ file, tag: m[0] })))
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c.tag, c.file).toMatch(/\bphoto=/)
  })
})
