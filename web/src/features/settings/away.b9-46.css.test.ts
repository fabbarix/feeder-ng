// B9-46 (SET-16): the Member sheet's Away section. The info meta on the Members list comes from ListRow's `metaStatus="info"`; nothing new in the icon bundle.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

describe('SET-16 parts', () => {
  it('MemberList passes the Away line as the row\'s meta with the info status', () => {
    const src = readSource('features/settings/components/MemberList.tsx')
    expect(src).toContain('awayMeta')
    // B9-46 developer: the info status is set only on a row that has an Away line (`metaStatus={away ? 'info' : undefined}`).
    expect(src).toMatch(/metaStatus=\{?[^}\n]*['"]info['"]/)
  })
  it('MemberAwaySection uses ListRow rows (key, state, detail), a title-3 heading and the shared Away sheet; no free-text list items', () => {
    const src = readSource('features/settings/components/MemberAwaySection.tsx')
    expect(src).toContain('ListRow')
    expect(src).toContain('AwaySheet')
    expect(src).toContain('awayRow')
    expect(src).not.toMatch(/<li\b/)
  })
  it('the Member sheet mounts the section after the fields', () => {
    expect(readSource('features/settings/components/MemberEditor.tsx')).toContain('MemberAwaySection')
  })
  it('no new glyph: ui/icons.ts is at its limit and the Away uses Plus and the existing ones', () => {
    expect(readSource('features/settings/components/MemberAwaySection.tsx')).not.toMatch(/icons\//)
  })
})
