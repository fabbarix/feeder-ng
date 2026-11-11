// WP-E/G: "Read a recipe" inside the Import screen: step order, wiring of the hooks, the done hand-off to Import Review,
// the photo choice and the read note in the review (ra-e-import.md sections 6.5, 6.6). The hooks are mocked.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { photos, plan, recipe, reviewExtras } from '../fixtures.test-helper'
import type { UseImportReview } from '../hooks/useImportReview'
import type { UseRecipeRead } from '../hooks/useRecipeRead'
import type { UseReadAvailability } from '../hooks/useReadAvailability'

const hook = vi.hoisted(() => ({
  review: {} as UseImportReview,
  read: {} as UseRecipeRead,
  avail: {} as UseReadAvailability,
  readOpts: [] as Array<{ onDone: unknown }>,
}))
vi.mock('../hooks/useImportReview', () => ({ useImportReview: () => hook.review }))
vi.mock('../hooks/useRecipeRead', () => ({
  useRecipeRead: (opts: { onDone: unknown }) => {
    hook.readOpts.push(opts)
    return hook.read
  },
}))
vi.mock('../hooks/useReadAvailability', () => ({ useReadAvailability: () => hook.avail }))
vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
vi.mock('../../../ui/ImagePicker', async () => (await import('../fakeImagePicker.test-helper')).fakeImagePickerModule())

import { ImportScreen } from './ImportScreen'

const review = (over: Partial<UseImportReview> = {}): UseImportReview => ({
  phase: 'source', plan: undefined, decisions: { ingredients: [], conversions: [], recipes: [] }, error: undefined, busy: false, stale: false,
  result: undefined, open: vi.fn(), chooseExisting: vi.fn(), chooseCreate: vi.fn(), answerConversion: vi.fn(), chooseRecipeAction: vi.fn(),
  confirm: vi.fn(), reset: vi.fn(), ...reviewExtras(), ...over,
})
const idle = (over: Partial<UseRecipeRead> = {}): UseRecipeRead => ({
  phase: 'idle', busy: false, kind: undefined, state: undefined, error: undefined, elapsedSeconds: 0,
  start: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined), reset: vi.fn(), ...over,
})
const avail = (over: Partial<UseReadAvailability> = {}): UseReadAvailability => ({
  loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn(), ...over,
})
const at = (path = '/recipes/import') => render(<MemoryRouter initialEntries={[path]}><ToastProvider><ImportScreen /></ToastProvider></MemoryRouter>)

beforeEach(() => {
  hook.review = review()
  hook.read = idle()
  hook.avail = avail()
  hook.readOpts.length = 0
})

describe('ImportScreen: Read a recipe', () => {
  it('puts the Read a recipe step first, above the Agent Prompt, and the file and review steps after', () => {
    at()
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(heads.slice(0, 4)).toEqual(['Read a recipe', 'Copy the Agent Prompt', 'Paste the Recipe File or choose a file', 'Review'])
    expect(screen.getByText('Step 1').closest('.tile')).toContainElement(screen.getByRole('heading', { name: 'Read a recipe' }))
  })
  it('the Recipe File route is still there when the Recipe Assistant is off', () => {
    hook.avail = avail({ enabled: false, message: 'The Recipe Assistant is off. Ask an Admin to turn it on.' })
    at()
    expect(screen.getByRole('button', { name: 'Copy Agent Prompt' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Or paste the JSON' })).toBeEnabled()
  })
  it('hands a finished read to Import Review: useRecipeRead gets useImportReview.adopt as onDone', () => {
    at()
    expect(hook.readOpts.at(-1)?.onDone).toBe(hook.review.adopt)
  })
  it('starts a read from the step through the hook', async () => {
    at()
    await userEvent.type(screen.getByRole('textbox', { name: 'Page address' }), 'https://example.com/soup')
    await userEvent.click(screen.getByRole('button', { name: 'Read recipe' }))
    expect(hook.read.start).toHaveBeenCalledWith({ kind: 'url', url: 'https://example.com/soup' })
  })
  it('shows progress with Cancel while reading', async () => {
    hook.read = idle({ phase: 'running', busy: true, kind: 'url', state: 'fetching' })
    at()
    // The ToastProvider's own (empty) polite region is a status too: pick the progress one.
    expect(screen.getAllByRole('status').map((r) => r.textContent)).toContain('Opening the page…')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(hook.read.cancel).toHaveBeenCalledOnce()
  })
  it('keeps the breadcrumbs and a single h1', () => {
    at()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  describe('/recipes/import#read (the "Read a recipe" row of the Recipes More sheet)', () => {
    it('moves focus to the step\'s heading so a keyboard or screen reader User lands on it', () => {
      Element.prototype.scrollIntoView = vi.fn()
      at('/recipes/import#read')
      expect(screen.getByRole('heading', { name: 'Read a recipe' })).toHaveFocus()
    })
    it('without the hash nothing steals the focus', () => {
      Element.prototype.scrollIntoView = vi.fn()
      at()
      expect(screen.getByRole('heading', { name: 'Read a recipe' })).not.toHaveFocus()
    })
  })
})

describe('ImportScreen: the review of a read', () => {
  const photoReview = (over: Partial<UseImportReview> = {}) =>
    review({
      phase: 'reviewing',
      plan: plan({ recipes: [recipe({ index: 0, name: 'Soup' }), recipe({ index: 1, name: 'Bread' })] }),
      reviewId: 'imp1',
      photos: photos(2),
      photoRecipes: [{ index: 0, name: 'Soup' }, { index: 1, name: 'Bread' }],
      photoChoice: { enabled: false, photo: 0, recipe: 0 },
      readNote: { modelName: 'Claude Haiku 5.5', structuredData: false },
      ...over,
    })

  it('a photo read shows the "Photo for the Recipe" tile, off, above the Confirm bar', () => {
    hook.review = photoReview()
    at()
    const sw = screen.getByRole('switch', { name: 'Use this photo for the Recipe' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    const confirm = screen.getByRole('button', { name: 'Confirm import' })
    expect(sw.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('wires the switch, the thumbnails and the Recipe choice to the hook', async () => {
    hook.review = photoReview({ photoChoice: { enabled: true, photo: 0, recipe: 0 } })
    at()
    await userEvent.click(screen.getByRole('radio', { name: 'Photo 2' }))
    expect(hook.review.choosePhoto).toHaveBeenCalledWith(1)
    await userEvent.click(screen.getByRole('switch', { name: 'Use this photo for the Recipe' }))
    expect(hook.review.setPhotoEnabled).toHaveBeenCalledWith(false)
    expect(screen.getByRole('img', { name: 'Photo 1' })).toHaveAttribute('src', '/api/imports/imp1/photos/0')
  })
  it('a Recipe File or a text read (no candidate photos) shows no photo tile', () => {
    hook.review = photoReview({ photos: [], photoRecipes: [] })
    at()
    expect(screen.queryByRole('switch', { name: 'Use this photo for the Recipe' })).toBeNull()
  })
  it('shows the read note chip with the model', () => {
    hook.review = photoReview()
    at()
    expect(screen.getByText('Read by Claude Haiku 5.5')).toBeInTheDocument()
  })
  it('a page read whose recipe data was used says so', () => {
    hook.review = photoReview({ readNote: { modelName: 'Claude Haiku 5.5', structuredData: true } })
    at()
    expect(screen.getByText("The page's recipe data was used as a hint")).toBeInTheDocument()
  })
  it('a Recipe File review has no read note', () => {
    hook.review = review({ phase: 'reviewing', plan: plan() })
    at()
    expect(screen.queryByText(/Read by/)).toBeNull()
  })
  it('Import Review itself is unchanged: Confirm calls confirm()', async () => {
    hook.review = photoReview()
    at()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    expect(hook.review.confirm).toHaveBeenCalledOnce()
  })
  it('the photo tile is gone once the import is done', () => {
    hook.review = photoReview({ phase: 'done', result: { recipes: [{ index: 0, id: 9, name: 'Soup', action: 'created' }], ingredientsCreated: 0, conversionsAdded: 0 } })
    at()
    expect(screen.queryByRole('switch', { name: 'Use this photo for the Recipe' })).toBeNull()
    expect(within(screen.getByRole('link', { name: 'Open Recipes' }).closest('.tile') as HTMLElement).getByText('Imported 1 Recipe')).toBeInTheDocument()
  })
})

describe('ImportScreen: focus after a read (accessibility)', () => {
  it('when a finished read opens the review, focus moves to the Review heading so the result is not missed', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { rerender } = at()
    hook.review = review({ phase: 'reviewing', plan: plan(), reviewId: 'imp1', readNote: { modelName: 'Claude Haiku 5.5', structuredData: false } })
    rerender(<MemoryRouter><ToastProvider><ImportScreen /></ToastProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Review' })).toHaveFocus()
  })
  it('a review opened from a file does not move focus', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const { rerender } = at()
    hook.review = review({ phase: 'reviewing', plan: plan(), reviewId: 'f1' })
    rerender(<MemoryRouter><ToastProvider><ImportScreen /></ToastProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Review' })).not.toHaveFocus()
  })
})
