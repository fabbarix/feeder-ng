// B9-31 (SAFE-01): useRecipeDraft, the reload and crash draft of the Recipe editor (hooks/useRecipeDraft.ts). It wraps lib/drafts
// (draftStore, draftDecision, draftCopy, draftWriter, all B9-18) and reports the unsaved flag for the update prompt.
//
//   const { notice, forget } = useRecipeDraft({
//     recipeId?: number            undefined = a new Recipe (key "<userId>:new"); the user id and household zone come from useMe()
//     ready: boolean               nothing is read or written before it (useRecipeEditor.ready)
//     draft: RecipeDraft, dirty: boolean, storedUpdatedAt: string | null
//     what: string                 "Roast tray" / "Recipe": the discard dialog's words (lib/editorExit.discardDialog)
//     restore(draft): void         useRecipeEditor.restoreDraft
//     reset(): void                useRecipeEditor.resetDraft
//     imageExists?(id): Promise<boolean>   false = the upload was swept (24 h orphan grace); a failing check keeps the Photo
//   }): { notice: DraftNoticeProps | null; forget(): Promise<void> }
//   - It opens the store with openDraftStore() (one per mount), reads the record once when `ready`, and decides with decideDraft.
//   - decision restore, or offer on this editor (a new Recipe's own draft): the draft goes to restore() at once; notice "Your unsaved
//     changes are back" with ONE action, Discard changes, which asks the SAFE-06 dialog ("Discard your changes?"); Discard changes there
//     removes the record, calls reset() and drops the notice; Keep editing leaves everything.
//   - decision ask (the stored Recipe changed since): nothing restored; notice "You have unsaved changes from <day>, <time>" with
//     Restore my changes (restore(draft), notice gone) and Discard them (record removed, notice gone, no dialog).
//   - decision orphaned: the record is removed, no notice. Expired or none: no notice.
//   - A restored or asked draft whose Photo (the Recipe's or a Step's) is gone is restored without it and the notice adds the
//     "photo was not kept" sentence.
//   - Writes: while `dirty`, 500 ms after the last change of `draft`, and on pagehide; the record carries baseUpdatedAt = storedUpdatedAt.
//     Not while clean (and when the editor turns clean again, e.g. the change was typed back, the record is removed). Not while an
//     `ask` notice is unanswered (the older draft would be overwritten).
//   - forget(): cancels a pending write and removes the record (after Save, after Discard changes in the leave dialog or Cancel).
//   - It reports `dirty` through useReportUnsavedChanges (ui/lib/unsavedChanges.ts).
import { act, renderHook, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetUnsavedChanges, useHasUnsavedChanges } from '../../../ui/lib/unsavedChanges'
import { ConfirmProvider } from '../../../ui'
import { createMemoryDraftStore, draftKey } from '../../../lib/drafts/draftStore'
import { draftFromRecipe, emptyDraft, type RecipeDraft } from '../lib/draft'
import { recipe } from '../fixtures.test-helper'
import { useRecipeDraft } from './useRecipeDraft'

const T0 = Date.parse('2026-11-14T15:02:00Z')
let store = createMemoryDraftStore()
vi.mock('../../../lib/drafts/draftStore', async (orig) => ({ ...(await orig<object>()), openDraftStore: async () => store }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 3, email: 'a@b.c', displayName: 'Anna', isAdmin: false, householdTimeZone: 'Europe/Rome' } }) }))

const wrapper = ({ children }: { children: ReactNode }) => <ConfirmProvider>{children}</ConfirmProvider>
const base = draftFromRecipe(recipe({ id: 42, name: 'Roast tray' }))
const mine: RecipeDraft = { ...base, name: 'Roast tray, my way' }
const STORED_AT = '2026-11-14T10:00:00Z'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(T0)
  store = createMemoryDraftStore({ now: () => Date.now() })
})
afterEach(() => {
  vi.useRealTimers()
  resetUnsavedChanges()
})

interface Props {
  recipeId?: number
  ready?: boolean
  draft?: RecipeDraft
  dirty?: boolean
  storedUpdatedAt?: string | null
}
function setup(initial: Props = {}) {
  const restore = vi.fn()
  const reset = vi.fn()
  const imageExists = vi.fn(async (_id: string) => true)
  const hook = renderHook(
    (p: Props) =>
      useRecipeDraft({
        recipeId: 42,
        ready: true,
        draft: base,
        dirty: false,
        storedUpdatedAt: STORED_AT,
        what: 'Roast tray',
        restore,
        reset,
        imageExists,
        ...p,
      }),
    { wrapper, initialProps: initial },
  )
  return { ...hook, restore, reset, imageExists }
}
const put = (draft: RecipeDraft, over: { baseUpdatedAt?: string | null; savedAt?: number; key?: string } = {}) =>
  store.put('recipe', over.key ?? draftKey(3, 42), { draft, baseUpdatedAt: over.baseUpdatedAt === undefined ? STORED_AT : over.baseUpdatedAt, savedAt: over.savedAt ?? T0 - 60_000 })
const stored = () => store.get<RecipeDraft>('recipe', draftKey(3, 42))
const settle = async (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

describe('opening the editor', () => {
  it('reads nothing before ready, then reads once', async () => {
    await put(mine)
    const h = setup({ ready: false })
    await settle(50)
    expect(h.restore).not.toHaveBeenCalled()
    expect(h.result.current.notice).toBeNull()
    h.rerender({ ready: true })
    await waitFor(() => expect(h.restore).toHaveBeenCalledOnce())
  })

  it('no stored draft: no notice, nothing restored', async () => {
    const h = setup()
    await settle(50)
    expect(h.result.current.notice).toBeNull()
    expect(h.restore).not.toHaveBeenCalled()
  })

  it('an unchanged stored Recipe: the draft is restored at once with "Your unsaved changes are back" and Discard changes only', async () => {
    await put(mine)
    const h = setup()
    await waitFor(() => expect(h.restore).toHaveBeenCalledWith(mine))
    const notice = h.result.current.notice!
    expect(notice.title).toBe('Your unsaved changes are back')
    expect(notice.meta).toContain('The page closed before you saved')
    expect(notice.meta).toContain('Sat 14 Nov at 16:01') // savedAt = T0 - 60 s = 15:01 UTC, shown in the household zone (Europe/Rome, 16:01)
    expect(notice.actions.map((a) => a.label)).toEqual(['Discard changes'])
  })

  it('says "on this computer" where there is no touch pointer, "on this phone" where there is', async () => {
    await put(mine)
    const h = setup()
    await waitFor(() => expect(h.result.current.notice).not.toBeNull())
    expect(h.result.current.notice!.meta).toContain('on this computer')
    h.unmount()

    window.matchMedia = ((q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    const phone = setup()
    await waitFor(() => expect(phone.result.current.notice).not.toBeNull())
    expect(phone.result.current.notice!.meta).toContain('on this phone')
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('a new Recipe\'s own draft is restored on its editor too (the offer on /recipes is the list\'s)', async () => {
    const newDraft = { ...emptyDraft(), name: 'Lasagne' }
    await put(newDraft, { key: draftKey(3, 'new'), baseUpdatedAt: null })
    const h = setup({ recipeId: undefined, storedUpdatedAt: null })
    await waitFor(() => expect(h.restore).toHaveBeenCalledWith(newDraft))
    expect(h.result.current.notice!.title).toBe('Your unsaved changes are back')
  })

  it('a draft older than 7 days is not offered', async () => {
    await put(mine, { savedAt: T0 - 8 * 24 * 3600_000 })
    const h = setup()
    await settle(50)
    expect(h.restore).not.toHaveBeenCalled()
    expect(h.result.current.notice).toBeNull()
  })

  it('a draft of a Recipe that is gone is removed, with no notice', async () => {
    await put(mine)
    const h = setup({ storedUpdatedAt: null })
    await waitFor(async () => expect(await stored()).toBeNull())
    expect(h.result.current.notice).toBeNull()
    expect(h.restore).not.toHaveBeenCalled()
  })

  it('another user\'s draft of the same Recipe is not read', async () => {
    await put(mine, { key: draftKey(9, 42) })
    const h = setup()
    await settle(50)
    expect(h.restore).not.toHaveBeenCalled()
  })
})

describe('someone saved the Recipe since (ask)', () => {
  const newer = '2026-11-14T15:00:00Z' // after the draft began (10:00), before it was written (15:01)

  it('restores nothing and asks, with Restore my changes and Discard them', async () => {
    await put(mine)
    const h = setup({ storedUpdatedAt: newer })
    await waitFor(() => expect(h.result.current.notice).not.toBeNull())
    expect(h.restore).not.toHaveBeenCalled()
    const notice = h.result.current.notice!
    expect(notice.title).toBe('You have unsaved changes from Sat 14 Nov, 16:01')
    expect(notice.meta).toContain('saved this Recipe since then')
    expect(notice.actions.map((a) => a.label)).toEqual(['Restore my changes', 'Discard them'])
  })

  it('Restore my changes puts the draft in the editor and the notice goes', async () => {
    await put(mine)
    const h = setup({ storedUpdatedAt: newer })
    await waitFor(() => expect(h.result.current.notice).not.toBeNull())
    act(() => h.result.current.notice!.actions[0]!.onClick())
    expect(h.restore).toHaveBeenCalledWith(mine)
    expect(h.result.current.notice).toBeNull()
  })

  it('Discard them removes the record and the notice goes, with no dialog', async () => {
    await put(mine)
    const h = setup({ storedUpdatedAt: newer })
    await waitFor(() => expect(h.result.current.notice).not.toBeNull())
    act(() => h.result.current.notice!.actions[1]!.onClick())
    await waitFor(async () => expect(await stored()).toBeNull())
    expect(h.result.current.notice).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.restore).not.toHaveBeenCalled()
  })

  it('writes nothing while the question is unanswered, even when the editor is dirty', async () => {
    await put(mine)
    const h = setup({ storedUpdatedAt: newer })
    await waitFor(() => expect(h.result.current.notice).not.toBeNull())
    h.rerender({ storedUpdatedAt: newer, dirty: true, draft: { ...base, name: 'Typed meanwhile' } })
    await settle(1000)
    expect((await stored())!.draft.name).toBe('Roast tray, my way')
  })
})

describe('Discard changes on the restored notice (SAFE-06 dialog)', () => {
  const open = async () => {
    await put(mine)
    const h = setup()
    await waitFor(() => expect(h.result.current.notice).not.toBeNull())
    act(() => h.result.current.notice!.actions[0]!.onClick())
    return h
  }

  it('asks "Discard your changes?" and Keep editing leaves the draft, the record and the notice', async () => {
    const h = await open()
    const dialog = await screen.findByRole('dialog', { name: 'Discard your changes?' })
    expect(dialog).toHaveTextContent('Your changes to Roast tray are lost.')
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(h.reset).not.toHaveBeenCalled()
    expect(await stored()).not.toBeNull()
    expect(h.result.current.notice).not.toBeNull()
  })

  it('Discard changes removes the record, resets the editor to the stored Recipe and drops the notice', async () => {
    const h = await open()
    await screen.findByRole('dialog', { name: 'Discard your changes?' })
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(h.reset).toHaveBeenCalledOnce())
    expect(await stored()).toBeNull()
    expect(h.result.current.notice).toBeNull()
  })
})

describe('a Photo that was swept', () => {
  it('is restored without it, and the notice says so', async () => {
    const withPhotos: RecipeDraft = { ...mine, image: 'gone1', steps: mine.steps.map((s, i) => ({ ...s, image: i === 1 ? 'kept2' : '' })) }
    await put(withPhotos)
    const h = setup()
    h.imageExists.mockImplementation(async (id: string) => id !== 'gone1')
    await waitFor(() => expect(h.restore).toHaveBeenCalled())
    const restored = h.restore.mock.calls[0]![0] as RecipeDraft
    expect(restored.image).toBe('')
    expect(restored.steps[1]!.image).toBe('kept2')
    expect(h.result.current.notice!.meta).toContain('The photo you added was not kept; add it again.')
  })

  it('a check that fails keeps the Photo (the network is not a verdict)', async () => {
    await put({ ...mine, image: 'x1' })
    const h = setup()
    h.imageExists.mockRejectedValue(new Error('offline'))
    await waitFor(() => expect(h.restore).toHaveBeenCalled())
    expect((h.restore.mock.calls[0]![0] as RecipeDraft).image).toBe('x1')
    expect(h.result.current.notice!.meta).not.toContain('not kept')
  })
})

describe('writing the draft', () => {
  // The 500 ms wait is measured on the fake clock only: with shouldAdvanceTime a loaded machine moved the clock past 500 ms
  // between "nothing at 499 ms" and its check, so these tests flaked (no waitFor here needs real time).
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })

  it('writes 500 ms after the last change while dirty, with the stored Recipe\'s updatedAt as the base', async () => {
    const h = setup()
    await settle(10)
    h.rerender({ dirty: true, draft: mine })
    await settle(499)
    expect(await stored()).toBeNull()
    await settle(2)
    expect(await stored()).toEqual({ draft: mine, baseUpdatedAt: STORED_AT, savedAt: expect.any(Number) })
  })

  it('every change restarts the wait', async () => {
    const h = setup()
    await settle(10)
    h.rerender({ dirty: true, draft: mine })
    await settle(400)
    h.rerender({ dirty: true, draft: { ...mine, name: 'Roast tray, my way 2' } })
    await settle(400)
    expect(await stored()).toBeNull()
    await settle(150)
    expect((await stored())!.draft.name).toBe('Roast tray, my way 2')
  })

  it('a new Recipe is written under "<userId>:new" with a null base', async () => {
    const h = setup({ recipeId: undefined, storedUpdatedAt: null, draft: emptyDraft() })
    await settle(10)
    h.rerender({ recipeId: undefined, storedUpdatedAt: null, dirty: true, draft: { ...emptyDraft(), name: 'Lasagne' } })
    await settle(600)
    expect(await store.get<RecipeDraft>('recipe', draftKey(3, 'new'))).toMatchObject({ baseUpdatedAt: null, draft: { name: 'Lasagne' } })
  })

  it('pagehide writes at once', async () => {
    const h = setup()
    await settle(10)
    h.rerender({ dirty: true, draft: mine })
    act(() => void window.dispatchEvent(new Event('pagehide')))
    await settle(0)
    expect((await stored())!.draft.name).toBe('Roast tray, my way')
  })

  it('writes nothing while clean', async () => {
    const h = setup()
    await settle(10)
    h.rerender({ dirty: false, draft: { ...base, name: 'Roast tray ' } })
    await settle(1000)
    expect(await stored()).toBeNull()
  })

  it('when the changes are typed back (clean again) the record is removed', async () => {
    const h = setup()
    await settle(10)
    h.rerender({ dirty: true, draft: mine })
    await settle(600)
    expect(await stored()).not.toBeNull()
    h.rerender({ dirty: false, draft: base })
    await settle(600)
    expect(await stored()).toBeNull()
  })

  it('forget() cancels a pending write and removes the record; later renders write nothing', async () => {
    const h = setup()
    await settle(10)
    h.rerender({ dirty: true, draft: mine })
    await settle(600)
    h.rerender({ dirty: true, draft: { ...mine, name: 'Edited again' } })
    await act(async () => void (await h.result.current.forget()))
    await settle(1000)
    expect(await stored()).toBeNull()
  })

  it('a store that fails never throws into the editor', async () => {
    store.put = vi.fn().mockRejectedValue(new Error('quota'))
    const h = setup()
    await settle(10)
    h.rerender({ dirty: true, draft: mine })
    await expect(settle(700)).resolves.not.toThrow()
  })
})

describe('the update prompt', () => {
  it('while dirty the app-level unsaved flag is on, and off once clean or unmounted', async () => {
    const flag = renderHook(() => useHasUnsavedChanges())
    const h = setup()
    expect(flag.result.current).toBe(false)
    h.rerender({ dirty: true, draft: mine })
    expect(flag.result.current).toBe(true)
    h.rerender({ dirty: false, draft: base })
    expect(flag.result.current).toBe(false)
    h.rerender({ dirty: true, draft: mine })
    h.unmount()
    expect(flag.result.current).toBe(false)
  })
})
