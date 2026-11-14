// The `font-24` scenario (DS-08, plan 3 section 9, owner B9-02): the routes read at a 24 px browser text size, set through CDP
// before the first navigation. P1 (no overflow) and P27 (role census, heading order) run there. B9-03's scenario registry
// loads this module.
export const FONT_24 = {
  name: 'font-24',
  fontSizePx: 24,
  routes: ['/', '/shop', '/settings/shops/:id', '/recipes/:id'],
  widths: [390, 1440],
  cdp: { method: 'Page.setFontSizes', params: { fontSizes: { standard: 24 } } },
  rules: ['P1', 'P27'],
}
