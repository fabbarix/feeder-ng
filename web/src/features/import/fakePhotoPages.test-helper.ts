// A stand-in for usePhotoPages in component and screen tests (replaces fakeImagePicker.test-helper.tsx). Not a test file.
// Use: vi.mock('../hooks/usePhotoPages', async () => (await import('../fakePhotoPages.test-helper')).fakePhotoPagesModule())
// then setPages({ ... }) in a test (or beforeEach) to choose what the hook answers; every callback is a vi.fn().
import { vi } from 'vitest'
import type { UsePhotoPages } from './hooks/usePhotoPages'
import { initialPhotoPages, type Photo, type PhotoPagesState, type PhotoSource } from './lib/photoPages'
import type { RawImage } from '../../ui'

export const JPEG_DATA = 'data:image/jpeg;base64,AAAA'
export const rawPhoto = (dataUrl = JPEG_DATA): RawImage => ({ kind: 'blob', blob: new Blob(['x'], { type: 'image/jpeg' }), dataUrl, width: 1500, height: 1000, type: 'image/jpeg', origin: 'file' })

const readyOutput = (w = 1500, h = 1000) => ({ status: 'ready' as const, blob: new Blob(['o'], { type: 'image/jpeg' }), width: w, height: h, type: 'image/jpeg' })

/** An image photo whose output is ready (1500 x 1000) over a 2000 x 1500 working copy. */
export function imagePhoto(id: string, over: Partial<Photo> = {}, origin: 'file' | 'camera' | 'paste' | 'drop' = 'file'): Photo {
  const source: PhotoSource = { kind: 'image', working: new Blob(['w'], { type: 'image/jpeg' }), width: 2000, height: 1500, origin }
  return { id, source, edit: null, output: readyOutput(), revision: 0, ...over }
}
export function heicPhoto(id: string, over: Partial<Photo> = {}): Photo {
  const source: PhotoSource = { kind: 'as-is', blob: new Blob(['h']), type: 'image/heic', name: 'IMG_1.heic' }
  return { id, source, edit: null, output: { ...readyOutput(0, 0), type: 'image/heic' }, revision: 0, ...over }
}
export function linkPhoto(id: string, over: Partial<Photo> = {}): Photo {
  return { id, source: { kind: 'link', url: 'https://example.com/card.jpg' }, edit: null, output: readyOutput(0, 0), revision: 0, ...over }
}

export type FakePagesInput = Partial<Omit<UsePhotoPages, 'state'>> & { state?: Partial<PhotoPagesState> }

export function fakePages(over: FakePagesInput = {}): UsePhotoPages {
  const { state, ...rest } = over
  return {
    state: { ...initialPhotoPages(), ...state },
    previewUrl: vi.fn((id: string) => `blob:preview/${id}`),
    editorUrl: 'blob:editor/1',
    addFiles: vi.fn(),
    addLink: vi.fn(),
    onPaste: vi.fn(),
    edit: vi.fn(),
    setDraft: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    dismissProblem: vi.fn(),
    busy: false,
    canRead: false,
    toReadInput: vi.fn(async () => ({ kind: 'photo' as const, photos: [rawPhoto()] })),
    restoredCount: 0,
    removeRestored: vi.fn(),
    finished: vi.fn(),
    ...rest,
  }
}

export const pagesRef: { current: UsePhotoPages } = { current: fakePages() }
export function setPages(over: FakePagesInput = {}): UsePhotoPages {
  pagesRef.current = fakePages(over)
  return pagesRef.current
}
export const fakePhotoPagesModule = () => ({ usePhotoPages: () => pagesRef.current })
