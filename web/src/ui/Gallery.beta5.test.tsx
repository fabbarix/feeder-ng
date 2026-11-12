// Beta.5 WP D: the Gallery's ListRow section shows the new glyphs and an expandable row.
import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Gallery } from './Gallery'
import { Icon } from './Icon'
import type { IconName } from './icons'

const svgOf = (name: IconName) => {
  const { container, unmount } = render(<Icon name={name} size={24} />)
  const html = container.querySelector('svg')?.innerHTML
  unmount()
  return html
}
const listRowSection = (scheme: string) => {
  const { container } = render(<Gallery />)
  const scope = container.querySelector<HTMLElement>(`[data-scheme="${scheme}"]`)!
  const h = within(scope).getByRole('heading', { level: 3, name: 'ListRow' })
  return h.closest('section') as HTMLElement
}

describe('Gallery: beta.5 ListRow rows', () => {
  it.each(['light', 'dark'] as const)('shows a row for each new glyph in the %s scheme', (scheme) => {
    const section = listRowSection(scheme)
    const rows: [string, string][] = [['Snowflake', 'snowflake'], ['Question', 'question'], ['Shopping cart', 'shoppingCart'], ['Guests', 'guests']]
    for (const [title, icon] of rows) {
      const row = within(section).getByText(title).closest('li')!
      expect(row.querySelector('.list-row__lead svg')?.innerHTML, title).toBe(svgOf(icon as IconName))
    }
  })

  it.each(['light', 'dark'] as const)('shows a collapsed and an expanded expandable row in the %s scheme', (scheme) => {
    const section = listRowSection(scheme)
    const toggles = section.querySelectorAll('button.list-row__target[aria-expanded]')
    expect(toggles.length).toBeGreaterThanOrEqual(2)
    expect(section.querySelector('button.list-row__target[aria-expanded="true"]')).not.toBeNull()
    expect(section.querySelector('button.list-row__target[aria-expanded="false"]')).not.toBeNull()
  })

  it('the demo row toggles when pressed', async () => {
    const section = listRowSection('light')
    const b = section.querySelector<HTMLButtonElement>('button.list-row__target[aria-expanded="false"]')!
    await userEvent.click(b)
    expect(b).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(b)
    expect(b).toHaveAttribute('aria-expanded', 'false')
  })
})
