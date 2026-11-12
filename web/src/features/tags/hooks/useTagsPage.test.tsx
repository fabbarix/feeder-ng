// useTagsPage: the sheet, Save, Merge into…, Delete, and what each one tells the User. Focus is checked in TagsScreen.test.tsx.
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findNotice } from '../../../test/notices'
import { allTags, fish, fishIntoSeafood, MERGE_FISH_INTO_SEAFOOD, DELETE_FISH, fishImpact, roast, roastImpact, seafood, seafoodImpact, tagRow } from '../fixtures'
import type { SaveResult } from '../types'
import { mockApi, tagsHarness } from '../test-utils'
import { useTagsPage } from './useTagsPage'

afterEach(() => vi.unstubAllGlobals())

const SERVER_TAKEN = { status: 409, json: { error: { code: 'tag_name_taken', message: 'There is already a Tag called Seafood', tag: { id: 3, name: 'Seafood', colour: 'teal' } } } }
const MERGE_HANDLERS = { 'GET /api/tags/1/impact?into=3': fishIntoSeafood, 'GET /api/tags/3/impact': seafoodImpact }

async function setup(handlers: Record<string, unknown> = {}, tags = allTags) {
  const api = mockApi({ 'GET /api/tags': tags, ...handlers })
  const { wrapper } = tagsHarness()
  const view = renderHook(() => useTagsPage(), { wrapper })
  await waitFor(() => expect(view.result.current.tags).toHaveLength(tags.length))
  return { api, view }
}
const page = (view: Awaited<ReturnType<typeof setup>>['view']) => view.result.current
const save = async (view: Awaited<ReturnType<typeof setup>>['view'], name: string, colour: string): Promise<SaveResult> => {
  let out!: SaveResult
  await act(async () => {
    out = await page(view).save({ name, colour })
  })
  return out
}

describe('useTagsPage: the list and the sheet', () => {
  it('has the Tags by name, closed, with no merge dialog', async () => {
    const { view } = await setup()
    expect(page(view).tags.map((t) => t.name)).toEqual(['fish', 'Pasta', 'Roast', 'Seafood'])
    expect(page(view)).toMatchObject({ sheet: null, mergePicker: null, busy: false, isLoading: false, isError: false })
  })

  it('a new Tag starts with the next colour: the one fewest Tags have, the first on a tie', async () => {
    const { view } = await setup()
    expect(page(view).newColour).toBe('mustard')
    const empty = await setup({}, [])
    expect(page(empty.view).newColour).toBe('tomato')
  })

  it('openNew, openEdit and closeSheet', async () => {
    const { view } = await setup()
    act(() => page(view).openNew())
    expect(page(view).sheet).toEqual({ mode: 'new' })
    act(() => page(view).openEdit(fish))
    expect(page(view).sheet).toEqual({ mode: 'edit', tag: fish })
    act(() => page(view).closeSheet())
    expect(page(view).sheet).toBeNull()
  })

  it('reports a list that cannot be loaded', async () => {
    mockApi({ 'GET /api/tags': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    const { wrapper } = tagsHarness()
    const view = renderHook(() => useTagsPage(), { wrapper })
    await waitFor(() => expect(view.result.current.isError).toBe(true))
    expect(view.result.current.tags).toEqual([])
  })
})

describe('useTagsPage: Save a new Tag', () => {
  it('POSTs the normalised name and the colour, closes the sheet and says so', async () => {
    const { api, view } = await setup({ 'POST /api/tags': { status: 201, json: tagRow(9, 'Soup', { colour: 'mustard' }) } })
    act(() => page(view).openNew())
    expect(await save(view, '  Soup ', 'mustard')).toEqual({ ok: true })
    expect(api.callsTo('POST', '/api/tags')[0]?.body).toEqual({ name: 'Soup', colour: 'mustard' })
    expect(page(view).sheet).toBeNull()
    await findNotice('status', 'Added Soup.')
  })

  it('a taken name is refused before any request, with the sentence that names the other Tag', async () => {
    const { api, view } = await setup()
    act(() => page(view).openNew())
    expect(await save(view, 'seafood', 'mustard')).toEqual({ ok: false, error: 'There is already a Tag called Seafood' })
    expect(api.callsTo('POST', '/api/tags')).toHaveLength(0)
    expect(page(view).sheet).toEqual({ mode: 'new' })
  })

  it('a name the server finds taken (the list was stale) gets the same sentence', async () => {
    const { view } = await setup({ 'POST /api/tags': SERVER_TAKEN }, [fish, roast])
    act(() => page(view).openNew())
    expect(await save(view, 'Seafood', 'mustard')).toEqual({ ok: false, error: 'There is already a Tag called Seafood' })
    expect(page(view).sheet).toEqual({ mode: 'new' })
  })

  it('an empty and a too long name are refused with their sentences', async () => {
    const { api, view } = await setup()
    act(() => page(view).openNew())
    expect(await save(view, '   ', 'mustard')).toEqual({ ok: false, error: 'Give the Tag a name.' })
    expect(await save(view, 'x'.repeat(41), 'mustard')).toEqual({ ok: false, error: 'A Tag name has at most 40 characters.' })
    expect(api.callsTo('POST', '/api/tags')).toHaveLength(0)
  })

  it('a 422 on the name from the server shows under Name', async () => {
    const { view } = await setup({ 'POST /api/tags': { status: 422, json: { error: { code: 'validation_failed', message: 'bad', field: 'name', reason: 'tag_invalid' } } } })
    act(() => page(view).openNew())
    expect(await save(view, 'Soup', 'mustard')).toEqual({ ok: false, error: 'A Tag name has 1 to 40 characters.' })
  })

  it('any other failure keeps the sheet, adds no field error and shows an error Toast', async () => {
    const { view } = await setup({ 'POST /api/tags': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    act(() => page(view).openNew())
    expect(await save(view, 'Soup', 'mustard')).toEqual({ ok: false })
    expect(page(view).sheet).toEqual({ mode: 'new' })
    await findNotice('alert', 'Could not save the Tag. Try again.')
  })
})

describe('useTagsPage: Save an edited Tag', () => {
  it('a new spelling of the same key is an ordinary rename: PATCH { name }', async () => {
    const { api, view } = await setup({ 'PATCH /api/tags/1': { json: { ...fish, name: 'Fish' } } })
    act(() => page(view).openEdit(fish))
    expect(await save(view, 'Fish', 'sky')).toEqual({ ok: true })
    expect(api.callsTo('PATCH', '/api/tags/1')[0]?.body).toEqual({ name: 'Fish' })
    expect(page(view).sheet).toBeNull()
    await findNotice('status', 'Renamed to Fish.')
  })

  it('a recolour sends only the colour', async () => {
    const { api, view } = await setup({ 'PATCH /api/tags/1': { json: { ...fish, colour: 'rose' } } })
    act(() => page(view).openEdit(fish))
    expect(await save(view, 'fish', 'rose')).toEqual({ ok: true })
    expect(api.callsTo('PATCH', '/api/tags/1')[0]?.body).toEqual({ colour: 'rose' })
    await findNotice('status', 'Saved fish.')
  })

  it('a rename and a recolour together send both', async () => {
    const { api, view } = await setup({ 'PATCH /api/tags/1': { json: fish } })
    act(() => page(view).openEdit(fish))
    await save(view, ' Sea  fish ', 'rose')
    expect(api.callsTo('PATCH', '/api/tags/1')[0]?.body).toEqual({ name: 'Sea fish', colour: 'rose' })
  })

  it('nothing changed: no request, the sheet just closes', async () => {
    const { api, view } = await setup()
    act(() => page(view).openEdit(fish))
    expect(await save(view, ' fish ', 'sky')).toEqual({ ok: true })
    expect(api.calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
    expect(page(view).sheet).toBeNull()
  })

  it('a failed write keeps the sheet and shows an error Toast', async () => {
    const { view } = await setup({ 'PATCH /api/tags/1': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    act(() => page(view).openEdit(fish))
    expect(await save(view, 'Fish', 'sky')).toEqual({ ok: false })
    expect(page(view).sheet).toEqual({ mode: 'edit', tag: fish })
    await findNotice('alert', 'Could not save the Tag. Try again.')
  })
})

describe('useTagsPage: rename onto another Tag asks to merge', () => {
  const rename = async (view: Awaited<ReturnType<typeof setup>>['view']) => {
    let result!: Promise<SaveResult>
    act(() => {
      result = page(view).save({ name: 'seafood', colour: 'sky' })
    })
    return result
  }

  it('shows the Merge confirm with the summary; Cancel keeps the sheet and merges nothing', async () => {
    const { api, view } = await setup(MERGE_HANDLERS)
    act(() => page(view).openEdit(fish))
    const result = rename(view)
    const dialog = await screen.findByRole('dialog', { name: 'Merge fish into Seafood?' })
    expect(dialog).toHaveTextContent(MERGE_FISH_INTO_SEAFOOD)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await result).toEqual({ ok: false })
    expect(page(view).sheet).toEqual({ mode: 'edit', tag: fish })
    expect(api.callsTo('POST', '/api/tags/1/merge')).toHaveLength(0)
    expect(api.callsTo('PATCH', '/api/tags/1')).toHaveLength(0)
  })

  it('Merge merges the Tag into the other, closes the sheet and says so', async () => {
    const { api, view } = await setup({ ...MERGE_HANDLERS, 'POST /api/tags/1/merge': { json: seafood } })
    act(() => page(view).openEdit(fish))
    const result = rename(view)
    await screen.findByRole('dialog', { name: 'Merge fish into Seafood?' })
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }))
    expect(await result).toEqual({ ok: true })
    expect(api.callsTo('POST', '/api/tags/1/merge')[0]?.body).toEqual({ into: 3 })
    expect(api.callsTo('PATCH', '/api/tags/1')).toHaveLength(0)
    expect(page(view).sheet).toBeNull()
    await findNotice('status', 'Merged fish into Seafood.')
  })

  it('a 409 tag_name_taken from the server (a stale list) opens the same confirm for the Tag it names', async () => {
    const { view } = await setup({ ...MERGE_HANDLERS, 'PATCH /api/tags/1': SERVER_TAKEN, 'POST /api/tags/1/merge': { json: seafood } }, [fish, roast, pasta()])
    act(() => page(view).openEdit(fish))
    let result!: Promise<SaveResult>
    act(() => {
      result = page(view).save({ name: 'Seafood', colour: 'sky' })
    })
    await screen.findByRole('dialog', { name: 'Merge fish into Seafood?' })
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }))
    expect(await result).toEqual({ ok: true })
  })

  it('a merge that fails keeps the sheet and shows an error Toast', async () => {
    const { view } = await setup({ ...MERGE_HANDLERS, 'POST /api/tags/1/merge': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    act(() => page(view).openEdit(fish))
    const result = rename(view)
    await screen.findByRole('dialog', { name: 'Merge fish into Seafood?' })
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }))
    expect(await result).toEqual({ ok: false })
    expect(page(view).sheet).toEqual({ mode: 'edit', tag: fish })
    await findNotice('alert', 'Could not merge the Tags. Try again.')
  })

  it('an impact that cannot be read shows an error Toast and no confirm', async () => {
    const { view } = await setup({ 'GET /api/tags/1/impact?into=3': { status: 500, json: { error: { code: 'internal', message: 'boom' } } }, 'GET /api/tags/3/impact': seafoodImpact })
    act(() => page(view).openEdit(fish))
    expect(await rename(view)).toEqual({ ok: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    await findNotice('alert', 'Could not check what the Tag is used by. Try again.')
  })
})
function pasta() {
  return tagRow(2, 'Pasta', { colour: 'apricot', recipes: 3 })
}

describe('useTagsPage: Merge into…', () => {
  it('opens for the Tag of the edit sheet, with no target; picking and closing', async () => {
    const { view } = await setup()
    act(() => page(view).openEdit(fish))
    act(() => page(view).openMergePicker())
    expect(page(view).mergePicker).toEqual({ source: fish, targetId: null })
    act(() => page(view).setMergeTarget(3))
    expect(page(view).mergePicker).toEqual({ source: fish, targetId: 3 })
    act(() => page(view).closeMergePicker())
    expect(page(view).mergePicker).toBeNull()
    expect(page(view).sheet).toEqual({ mode: 'edit', tag: fish })
  })

  it('does nothing without an edit sheet', async () => {
    const { view } = await setup()
    act(() => page(view).openMergePicker())
    expect(page(view).mergePicker).toBeNull()
    act(() => page(view).openNew())
    act(() => page(view).openMergePicker())
    expect(page(view).mergePicker).toBeNull()
  })

  it('Review merge does nothing until a target is chosen', async () => {
    const { api, view } = await setup()
    act(() => page(view).openEdit(fish))
    act(() => page(view).openMergePicker())
    await act(async () => page(view).reviewMerge())
    expect(screen.queryByRole('dialog', { name: /^Merge/ })).toBeNull()
    expect(api.calls.filter((c) => c.path.includes('impact'))).toHaveLength(0)
  })

  it('Review merge confirms, merges, then closes the dialog and the sheet', async () => {
    const { api, view } = await setup({ ...MERGE_HANDLERS, 'POST /api/tags/1/merge': { json: seafood } })
    act(() => page(view).openEdit(fish))
    act(() => page(view).openMergePicker())
    act(() => page(view).setMergeTarget(3))
    let done!: Promise<void>
    act(() => {
      done = page(view).reviewMerge()
    })
    const dialog = await screen.findByRole('dialog', { name: 'Merge fish into Seafood?' })
    expect(dialog).toHaveTextContent(MERGE_FISH_INTO_SEAFOOD)
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await act(async () => done)
    expect(api.callsTo('POST', '/api/tags/1/merge')[0]?.body).toEqual({ into: 3 })
    expect(page(view)).toMatchObject({ mergePicker: null, sheet: null })
    await findNotice('status', 'Merged fish into Seafood.')
  })

  it('Cancel in the confirm goes back to the dialog with the target kept', async () => {
    const { api, view } = await setup(MERGE_HANDLERS)
    act(() => page(view).openEdit(fish))
    act(() => page(view).openMergePicker())
    act(() => page(view).setMergeTarget(3))
    let done!: Promise<void>
    act(() => {
      done = page(view).reviewMerge()
    })
    await screen.findByRole('dialog', { name: 'Merge fish into Seafood?' })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => done)
    expect(page(view).mergePicker).toEqual({ source: fish, targetId: 3 })
    expect(page(view).sheet).toEqual({ mode: 'edit', tag: fish })
    expect(api.callsTo('POST', '/api/tags/1/merge')).toHaveLength(0)
  })
})

describe('useTagsPage: Delete', () => {
  const ask = async (view: Awaited<ReturnType<typeof setup>>['view']) => {
    let done!: Promise<void>
    act(() => {
      done = page(view).deleteTag()
    })
    return done
  }

  it('names the Recipes and rules affected and offers Delete, Merge instead and Cancel', async () => {
    const { view } = await setup({ 'GET /api/tags/1/impact': fishImpact })
    act(() => page(view).openEdit(fish))
    const done = ask(view)
    const dialog = await screen.findByRole('dialog', { name: 'Delete fish?' })
    expect(dialog).toHaveTextContent(DELETE_FISH)
    for (const name of ['Delete', 'Merge instead', 'Cancel']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => done)
    expect(page(view).sheet).toEqual({ mode: 'edit', tag: fish })
  })

  it('Delete removes the Tag, closes the sheet and says so', async () => {
    const { api, view } = await setup({ 'GET /api/tags/1/impact': fishImpact, 'DELETE /api/tags/1': { status: 204 } })
    act(() => page(view).openEdit(fish))
    const done = ask(view)
    await screen.findByRole('dialog', { name: 'Delete fish?' })
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(async () => done)
    expect(api.callsTo('DELETE', '/api/tags/1')).toHaveLength(1)
    expect(page(view).sheet).toBeNull()
    await findNotice('status', 'Deleted fish.')
  })

  it('never refuses: a Tag nothing uses still gets a confirm and can be deleted', async () => {
    const { api, view } = await setup({ 'GET /api/tags/4/impact': roastImpact, 'DELETE /api/tags/4': { status: 204 } })
    act(() => page(view).openEdit(roast))
    const done = ask(view)
    const dialog = await screen.findByRole('dialog', { name: 'Delete Roast?' })
    expect(dialog).toHaveTextContent('Roast is on no Recipes.')
    expect(dialog).not.toHaveTextContent('These go too')
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(async () => done)
    expect(api.callsTo('DELETE', '/api/tags/4')).toHaveLength(1)
  })

  it('Merge instead opens the Merge into… dialog for the same Tag and deletes nothing', async () => {
    const { api, view } = await setup({ 'GET /api/tags/1/impact': fishImpact })
    act(() => page(view).openEdit(fish))
    const done = ask(view)
    await screen.findByRole('dialog', { name: 'Delete fish?' })
    await userEvent.click(screen.getByRole('button', { name: 'Merge instead' }))
    await act(async () => done)
    expect(page(view).mergePicker).toEqual({ source: fish, targetId: null })
    expect(api.callsTo('DELETE', '/api/tags/1')).toHaveLength(0)
  })

  it('a delete that fails keeps the sheet and shows an error Toast', async () => {
    const { view } = await setup({ 'GET /api/tags/1/impact': fishImpact, 'DELETE /api/tags/1': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    act(() => page(view).openEdit(fish))
    const done = ask(view)
    await screen.findByRole('dialog', { name: 'Delete fish?' })
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(async () => done)
    expect(page(view).sheet).toEqual({ mode: 'edit', tag: fish })
    await findNotice('alert', 'Could not delete the Tag. Try again.')
  })

  it('an impact that cannot be read shows an error Toast and no confirm', async () => {
    const { view } = await setup({ 'GET /api/tags/1/impact': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    act(() => page(view).openEdit(fish))
    await act(async () => ask(view))
    expect(screen.queryByRole('dialog')).toBeNull()
    await findNotice('alert', 'Could not check what the Tag is used by. Try again.')
  })
})
