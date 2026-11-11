// R2-3 (L-06): Settings pages are one width. Narrow (720) for every Settings page except Meal Slots (default: the week grid needs
// it, R15). Notifications is narrow too (it was 640 centred). F-02 (Allowlist) is verified by allowlist.css.test.ts and
// components/AllowlistPanel.layout.test.tsx (A1); nothing to add here.
import { describe, expect, it } from 'vitest'
import { pageWidthFor } from '../../app/pageWidths'

describe('Settings page widths', () => {
  it.each(['/settings', '/settings/household', '/settings/preferences', '/settings/members', '/settings/allowlist', '/settings/shops', '/settings/shops/4', '/settings/notifications', '/ingredients', '/ingredients/3', '/products', '/products/3'])(
    '%s is narrow',
    (path) => expect(pageWidthFor(path)).toBe('narrow'),
  )
  it('Meal Slots keeps the default width', () => expect(pageWidthFor('/settings/meal-slots')).toBe('default'))
})
