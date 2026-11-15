// B9-51 (SET-11): the Tags rows. The Tag is the title, the count the value; the row is named "<Tag>, <count>". Long names wrap to two lines.
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fish, roast, tagRow } from '../fixtures'
import { mockApi, renderWithProviders, ADMIN_ME } from '../test-utils'
import { TagsScreen } from './TagsScreen'

afterEach(() => vi.unstubAllGlobals())

const LONG = 'HEARTY HOMEMADE MUSHROOM WELLINGTONS'

async function show() {
  mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/tags': [fish, roast, tagRow(5, LONG, { colour: 'mustard', recipes: 1 }), tagRow(6, 'beef', { colour: 'olive', recipes: 1 })] })
  renderWithProviders(<TagsScreen />, '/settings/tags')
  return within(await screen.findByRole('list', { name: 'Tags' }))
}

describe('Tags rows (SET-11)', () => {
  it('the full Tag name is the row title, never a pill, whatever its length', async () => {
    const list = await show()
    expect(list.getByText(LONG).closest('.list-row__title')).not.toBeNull()
    expect(list.getByText(LONG).closest('.chip')).toBeNull()
  })

  it('the count is the value, "1 Recipe" for one and "None" for none, and it is not part of the title', async () => {
    const list = await show()
    const row = (name: string) => list.getByRole('button', { name: new RegExp(`^${name}, `) }).closest('li')!
    expect(row('beef').querySelector('.list-row__value')).toHaveTextContent('1 Recipe')
    expect(row('Roast').querySelector('.list-row__value')).toHaveTextContent('None')
    expect(row('beef').querySelector('.list-row__title')).toHaveTextContent(/^beef$/)
  })

  it('the leading is the Tag swatch of its colour pair, decorative', async () => {
    const list = await show()
    const lead = list.getByRole('button', { name: `${LONG}, 1 Recipe` }).closest('li')!.querySelector('.tag-lead')!
    expect(lead).toHaveAttribute('data-tag-colour', 'mustard')
    expect(lead).toHaveAttribute('aria-hidden', 'true')
  })

  it('each row is named "<Tag>, <count>" and the rules after it, and still has its chevron', async () => {
    const list = await show()
    expect(list.getByRole('button', { name: 'beef, 1 Recipe' })).toBeInTheDocument()
    expect(list.getByRole('button', { name: 'fish, 12 Recipes · 1 Slot Rule · Variety Rule' }).closest('li')!.querySelector('.list-row__chevron')).not.toBeNull()
  })
})
