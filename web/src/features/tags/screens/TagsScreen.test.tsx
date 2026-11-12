// /settings/tags (TG-S): the Tags on the shared ListPage, and Add, Rename, Recolour, Merge and Delete through the sheet and its confirms.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tag } from '../../../lib/tags'
import { findNotice, noticeWith } from '../../../test/notices'
import {
  allTags, DELETE_FISH, fish, fishImpact, fishIntoSeafood, MERGE_FISH_INTO_SEAFOOD, roast, roastImpact, seafood, seafoodImpact, tagRow,
} from '../fixtures'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../test-utils'
import { pickOption } from '../../settings/test-utils'
import { TagsScreen } from './TagsScreen'

afterEach(() => vi.unstubAllGlobals())

/** A stub server that keeps the list, so a refetch after a write sees the write. */
function setup(initial: Tag[] = allTags, extra: Record<string, unknown> = {}, me: unknown = ADMIN_ME) {
  const state = { list: [...initial] }
  const api = mockApi({
    'GET /api/me': me,
    'GET /api/tags': () => state.list,
    'GET /api/tags/1/impact': fishImpact,
    'GET /api/tags/1/impact?into=3': fishIntoSeafood,
    'GET /api/tags/3/impact': seafoodImpact,
    'GET /api/tags/4/impact': roastImpact,
    ...extra,
  })
  renderWithProviders(<TagsScreen />, '/settings/tags')
  return { api, state }
}
const show = async (...args: Parameters<typeof setup>) => {
  const view = setup(...args)
  await screen.findByRole('list', { name: 'Tags' })
  return view
}
const list = () => screen.getByRole('list', { name: 'Tags' })
const rows = () => within(list()).getAllByRole('listitem')
const rowButton = (name: string) => within(list()).getByRole('button', { name })
const FISH_ROW = 'fish, 12 Recipes · 1 Slot Rule · Variety Rule'
const openFish = async () => {
  await userEvent.click(rowButton(FISH_ROW))
  return screen.findByRole('dialog', { name: 'Edit Tag' })
}
const checkedColour = (scope: HTMLElement) => within(scope).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.getAttribute('aria-label'))

describe('TagsScreen: the list', () => {
  it('has its h1, a Settings breadcrumb and the explanation', async () => {
    await show()
    expect(screen.getByRole('heading', { level: 1, name: 'Tags' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByText(/the colour each one shows in/)).toBeInTheDocument()
  })

  it('lists the Tags by name, each as a pill in its colour with what uses it', async () => {
    await show()
    expect(rows().map((r) => within(r).getByRole('button').getAttribute('aria-label'))).toEqual([
      FISH_ROW, 'Pasta, 3 Recipes', 'Roast, No Recipes yet', 'Seafood, 4 Recipes · Variety Rule',
    ])
    const colours = rows().map((r) => r.querySelector('.chip[data-kind="tag"]')?.getAttribute('data-tag-colour'))
    expect(colours).toEqual(['sky', 'apricot', 'tomato', 'teal'])
    expect(rows().map((r) => r.querySelector('.chip')?.textContent)).toEqual(['fish', 'Pasta', 'Roast', 'Seafood'])
    expect(within(rows()[0]!).getByText('12 Recipes · 1 Slot Rule · Variety Rule')).toBeInTheDocument()
    expect(within(rows()[2]!).getByText('No Recipes yet')).toBeInTheDocument()
  })

  it('Add Tag ends the list', async () => {
    await show()
    const add = screen.getByRole('button', { name: 'Add Tag' })
    expect(list().compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('any User, not only an Admin, can add and edit: there is no read-only mode', async () => {
    await show(allTags, {}, USER_ME)
    expect(screen.getByRole('button', { name: 'Add Tag' })).toBeEnabled()
    expect(screen.queryByText(/Only an Admin/)).toBeNull()
    await openFish()
  })

  it('says it is loading, and says so when the Tags cannot be loaded', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/tags': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    renderWithProviders(<TagsScreen />, '/settings/tags')
    expect(noticeWith('status', 'Loading Tags')).toBeDefined()
    expect(await screen.findByText('Could not load the Tags.')).toBeInTheDocument()
  })

  it('with no Tag shows the empty state "No Tags yet" and Add Tag', async () => {
    setup([])
    expect(await screen.findByRole('heading', { name: 'No Tags yet' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Tags' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add Tag' })).toBeInTheDocument()
  })

  it('is composed from the shared ListPage and its hooks; no native dialog or select, no API call in the markup', () => {
    const raw = import.meta.glob(['./TagsScreen.tsx', '../components/*.tsx', '../hooks/useTagsPage.ts', '!../**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const code = (path: string) => (raw[path] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const screenSource = code('./TagsScreen.tsx')
    expect(screenSource).toMatch(/<ListPage\b/)
    expect(screenSource).not.toMatch(/className="pg"/)
    for (const [path, text] of Object.entries(raw)) {
      const source = code(path)
      expect(source, path).not.toMatch(/\b(window\.)?(alert|confirm|prompt)\(/)
      expect(source, path).not.toMatch(/<select\b/)
      expect(source, path).not.toMatch(/<input\b[^>]*type="(color|checkbox|radio)"/)
      if (!path.includes('/hooks/')) expect(source, path).not.toMatch(/\b(fetch|tagsApi|tagMergeApi)\b/)
      expect(text.length, path).toBeGreaterThan(0)
    }
    expect(code('../hooks/useTagsPage.ts')).toMatch(/\buseTags\(/)
    expect(code('../hooks/useTagsPage.ts')).toMatch(/\buseTagActions\(/)
  })
})

describe('TagsScreen: Add Tag', () => {
  it('opens the sheet with an empty Name and the next colour checked; Cancel by Escape leaves nothing behind', async () => {
    await show()
    await userEvent.click(screen.getByRole('button', { name: 'Add Tag' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add Tag' })
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toHaveValue('')
    expect(checkedColour(sheet)).toEqual(['Mustard'])
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add Tag' })).toHaveFocus()
  })

  it('saves the name and the colour, shows the new row, says so and puts focus on the new row', async () => {
    const { api, state } = await show(allTags, {
      'POST /api/tags': (c: { body?: unknown }) => {
        const body = c.body as { name: string; colour: string }
        const created = tagRow(9, body.name, { colour: body.colour })
        state.list.push(created)
        return { status: 201, json: created }
      },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Add Tag' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add Tag' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Soup')
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Plum' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save Tag' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/tags')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/tags')[0]?.body).toEqual({ name: 'Soup', colour: 'plum' })
    await findNotice('status', 'Added Soup.')
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(rowButton('Soup, No Recipes yet')).toHaveFocus())
    expect(rows().map((r) => r.querySelector('.chip')?.textContent)).toEqual(['fish', 'Pasta', 'Roast', 'Seafood', 'Soup'])
    expect(api.callsTo('GET', '/api/tags').length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the next colour when the User does not choose one', async () => {
    const { api } = await show(allTags, { 'POST /api/tags': { status: 201, json: tagRow(9, 'Soup', { colour: 'mustard' }) } })
    await userEvent.click(screen.getByRole('button', { name: 'Add Tag' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add Tag' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Soup{Enter}')
    await waitFor(() => expect(api.callsTo('POST', '/api/tags')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/tags')[0]?.body).toEqual({ name: 'Soup', colour: 'mustard' })
  })

  it('the first Tag of an empty Household starts Tomato, and the 11th colour repeats', async () => {
    setup([])
    await userEvent.click(await screen.findByRole('button', { name: 'Add Tag' }))
    expect(checkedColour(await screen.findByRole('dialog', { name: 'Add Tag' }))).toEqual(['Tomato'])
  })

  it('a taken name is refused under Name with the sentence naming the other Tag, and nothing is sent', async () => {
    const { api } = await show()
    await userEvent.click(screen.getByRole('button', { name: 'Add Tag' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add Tag' })
    const name = within(sheet).getByRole('textbox', { name: 'Name' })
    await userEvent.type(name, 'seafood')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save Tag' }))
    expect(await within(sheet).findByText('There is already a Tag called Seafood')).toBeInTheDocument()
    expect(name).toHaveAccessibleDescription(/There is already a Tag called Seafood/)
    expect(name).toHaveValue('seafood')
    expect(api.callsTo('POST', '/api/tags')).toHaveLength(0)
    expect(screen.getByRole('dialog', { name: 'Add Tag' })).toBeInTheDocument()
  })

  it('a failed write keeps the sheet and shows an error Toast', async () => {
    await show(allTags, { 'POST /api/tags': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    await userEvent.click(screen.getByRole('button', { name: 'Add Tag' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add Tag' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Soup{Enter}')
    await findNotice('alert', 'Could not save the Tag. Try again.')
    expect(screen.getByRole('dialog', { name: 'Add Tag' })).toBeInTheDocument()
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toHaveValue('Soup')
  })
})

describe('TagsScreen: Edit Tag', () => {
  it('a row opens its sheet with the name, the colour checked and the pill', async () => {
    await show()
    const sheet = await openFish()
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toHaveValue('fish')
    expect(checkedColour(sheet)).toEqual(['Sky'])
    expect(within(sheet).getByTestId('tag-preview').querySelector('.chip[data-tag-colour="sky"]')).not.toBeNull()
  })

  it('Enter on a focused row opens the sheet, and Escape closes it with focus back on the row', async () => {
    await show()
    rowButton(FISH_ROW).focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('dialog', { name: 'Edit Tag' })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(rowButton(FISH_ROW)).toHaveFocus()
  })

  it('a new spelling of the same name saves as an ordinary rename', async () => {
    const { api, state } = await show(allTags, {
      'PATCH /api/tags/1': () => {
        state.list = state.list.map((t) => (t.id === 1 ? { ...t, name: 'Fish' } : t))
        return { ...fish, name: 'Fish' }
      },
    })
    const sheet = await openFish()
    const name = within(sheet).getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Fish{Enter}')
    await waitFor(() => expect(api.callsTo('PATCH', '/api/tags/1')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/tags/1')[0]?.body).toEqual({ name: 'Fish' })
    await findNotice('status', 'Renamed to Fish.')
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(rowButton('Fish, 12 Recipes · 1 Slot Rule · Variety Rule')).toHaveFocus())
  })

  it('focus follows a renamed row to its new place in the name order', async () => {
    const { state } = await show(allTags, {
      'PATCH /api/tags/2': () => {
        state.list = state.list.map((t) => (t.id === 2 ? { ...t, name: 'Zucchini' } : t))
        return { ...allTags[3], name: 'Zucchini' }
      },
    })
    await userEvent.click(rowButton('Pasta, 3 Recipes'))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Tag' })
    const name = within(sheet).getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Zucchini{Enter}')
    await waitFor(() => expect(rowButton('Zucchini, 3 Recipes')).toHaveFocus())
    expect(rows().map((r) => r.querySelector('.chip')?.textContent)).toEqual(['fish', 'Roast', 'Seafood', 'Zucchini'])
  })

  it('recolours with the picker and sends only the colour', async () => {
    const { api } = await show(allTags, { 'PATCH /api/tags/1': { json: { ...fish, colour: 'rose' } } })
    const sheet = await openFish()
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Rose' }))
    expect(within(sheet).getByTestId('tag-preview').querySelector('.chip[data-tag-colour="rose"]')).not.toBeNull()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save Tag' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/tags/1')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/tags/1')[0]?.body).toEqual({ colour: 'rose' })
    await findNotice('status', 'Saved fish.')
  })

  it('changing nothing closes the sheet without a request', async () => {
    const { api } = await show()
    const sheet = await openFish()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save Tag' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
    expect(rowButton(FISH_ROW)).toHaveFocus()
  })

  it('a failed write keeps the sheet and shows an error Toast', async () => {
    await show(allTags, { 'PATCH /api/tags/1': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    const sheet = await openFish()
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Rose' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save Tag' }))
    await findNotice('alert', 'Could not save the Tag. Try again.')
    expect(screen.getByRole('dialog', { name: 'Edit Tag' })).toBeInTheDocument()
    expect(checkedColour(sheet)).toEqual(['Rose'])
  })
})

describe('TagsScreen: rename onto another Tag asks "Merge fish into Seafood?"', () => {
  const typeSeafood = async () => {
    const sheet = await openFish()
    const name = within(sheet).getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'seafood')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save Tag' }))
    return { sheet, name }
  }

  it('shows the merge confirm with the summary, and Cancel keeps the sheet open with the typed name', async () => {
    const { api } = await show()
    const { sheet, name } = await typeSeafood()
    const confirm = await screen.findByRole('dialog', { name: 'Merge fish into Seafood?' })
    expect(confirm).toHaveTextContent(MERGE_FISH_INTO_SEAFOOD)
    expect(within(confirm).getByRole('button', { name: 'Merge' })).toBeInTheDocument()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Merge fish into Seafood?' })).toBeNull()
    expect(sheet).toBeInTheDocument()
    expect(name).toHaveValue('seafood')
    expect(api.calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
  })

  it('Merge merges fish into Seafood, closes the sheet, drops fish and puts focus on the row that takes its place', async () => {
    const { api, state } = await show(allTags, {
      'POST /api/tags/1/merge': () => {
        state.list = state.list.filter((t) => t.id !== 1)
        return { ...seafood, recipes: 12 }
      },
    })
    await typeSeafood()
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Merge fish into Seafood?' })).getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/tags/1/merge')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/tags/1/merge')[0]?.body).toEqual({ into: 3 })
    expect(api.callsTo('PATCH', '/api/tags/1')).toHaveLength(0)
    await findNotice('status', 'Merged fish into Seafood.')
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(rows().map((r) => r.querySelector('.chip')?.textContent)).toEqual(['Pasta', 'Roast', 'Seafood']))
    await waitFor(() => expect(rowButton('Pasta, 3 Recipes')).toHaveFocus())
  })
})

describe('TagsScreen: Merge into…', () => {
  it('picks the other Tag from the shared Tag select, reviews, merges', async () => {
    const { api, state } = await show(allTags, {
      'POST /api/tags/1/merge': () => {
        state.list = state.list.filter((t) => t.id !== 1)
        return seafood
      },
    })
    const sheet = await openFish()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Merge into…' }))
    const picker = await screen.findByRole('dialog', { name: 'Merge fish into…' })
    await pickOption('Merge into', /Seafood/, within(picker))
    await userEvent.click(within(picker).getByRole('button', { name: 'Review merge' }))
    const confirm = await screen.findByRole('dialog', { name: 'Merge fish into Seafood?' })
    expect(confirm).toHaveTextContent(MERGE_FISH_INTO_SEAFOOD)
    await userEvent.click(within(confirm).getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/tags/1/merge')[0]?.body).toEqual({ into: 3 }))
    await findNotice('status', 'Merged fish into Seafood.')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('Cancel in the picker leaves the sheet open', async () => {
    await show()
    const sheet = await openFish()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Merge into…' }))
    const picker = await screen.findByRole('dialog', { name: 'Merge fish into…' })
    await userEvent.click(within(picker).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Merge fish into…' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Edit Tag' })).toBeInTheDocument()
  })
})

describe('TagsScreen: Delete', () => {
  it('names the Recipes and the rules it takes along, and offers Delete, Merge instead and Cancel', async () => {
    await show()
    const sheet = await openFish()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete Tag' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete fish?' })
    expect(confirm).toHaveTextContent(DELETE_FISH)
    expect(within(confirm).getAllByRole('button').map((b) => b.textContent)).toEqual(expect.arrayContaining(['Cancel', 'Merge instead', 'Delete']))
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog', { name: 'Edit Tag' })).toBeInTheDocument()
  })

  it('Delete removes the Tag, closes the sheet, and focus moves to the row that took its place', async () => {
    const { api, state } = await show(allTags, {
      'DELETE /api/tags/1': () => {
        state.list = state.list.filter((t) => t.id !== 1)
        return { status: 204 }
      },
    })
    const sheet = await openFish()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete Tag' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete fish?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/tags/1')).toHaveLength(1))
    await findNotice('status', 'Removed fish.')
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(rowButton('Pasta, 3 Recipes')).toHaveFocus())
    expect(rows()).toHaveLength(3)
  })

  it('deleting the last row of the list moves focus to the row before it', async () => {
    const { state } = await show(allTags, {
      'DELETE /api/tags/3': () => {
        state.list = state.list.filter((t) => t.id !== 3)
        return { status: 204 }
      },
    })
    await userEvent.click(rowButton('Seafood, 4 Recipes · Variety Rule'))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Tag' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete Seafood?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(rowButton('Roast, No Recipes yet')).toHaveFocus())
  })

  it('deleting the only Tag moves focus to Add Tag', async () => {
    const { state } = setup([roast], {
      'DELETE /api/tags/4': () => {
        state.list = []
        return { status: 204 }
      },
    })
    await userEvent.click(await within(await screen.findByRole('list', { name: 'Tags' })).findByRole('button', { name: 'Roast, No Recipes yet' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Tag' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete Roast?' })
    expect(confirm).toHaveTextContent('Roast is on no Recipes.')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('heading', { name: 'No Tags yet' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Tag' })).toHaveFocus())
  })

  it('Merge instead goes to the Merge into… dialog for the same Tag, and nothing is deleted', async () => {
    const { api } = await show()
    const sheet = await openFish()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete Tag' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete fish?' })).getByRole('button', { name: 'Merge instead' }))
    expect(await screen.findByRole('dialog', { name: 'Merge fish into…' })).toBeInTheDocument()
    expect(api.callsTo('DELETE', '/api/tags/1')).toHaveLength(0)
  })

  it('a fast double tap on Delete Tag loads the impact once, and the button is disabled while it loads', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { api } = await show(allTags, { 'GET /api/tags/1/impact': async () => { await gate; return fishImpact } })
    const sheet = await openFish()
    const del = within(sheet).getByRole('button', { name: 'Delete Tag' })
    await userEvent.dblClick(del)
    await waitFor(() => expect(del).toBeDisabled())
    release()
    await screen.findByRole('dialog', { name: 'Delete fish?' })
    expect(api.callsTo('GET', '/api/tags/1/impact')).toHaveLength(1)
  })

  it('a failed delete keeps the sheet and shows an error Toast', async () => {
    await show(allTags, { 'DELETE /api/tags/1': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    const sheet = await openFish()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete Tag' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete fish?' })).getByRole('button', { name: 'Delete' }))
    await findNotice('alert', 'Could not delete the Tag. Try again.')
    expect(screen.getByRole('dialog', { name: 'Edit Tag' })).toBeInTheDocument()
  })
})
