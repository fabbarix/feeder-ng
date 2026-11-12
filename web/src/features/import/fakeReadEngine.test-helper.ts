// Test doubles for usePhotoPages: a fake ReadImageEngine (no canvas, no decoder), a counting object-URL api, a spying store and
// header-byte builders for the 50 MP checks. Not a test file.
import { vi } from 'vitest'
import type { ReadImageEngine, Working } from '../../ui'
import { createMemoryPhotoStore, type PhotoStore } from './lib/photoStore'

export function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export interface FakeEngine extends ReadImageEngine {
  normalise: ReturnType<typeof vi.fn> & ReadImageEngine['normalise']
  decode: ReturnType<typeof vi.fn> & ReadImageEngine['decode']
  encode: ReturnType<typeof vi.fn> & ReadImageEngine['encode']
  readHead: ReturnType<typeof vi.fn> & ReadImageEngine['readHead']
  /** The pixel size of every working copy this engine made (decode answers with it). */
  sizes: WeakMap<Blob, { width: number; height: number }>
  /** The most renders (decode..encode) that were ever in flight together. */
  maxParallelRenders: () => number
}

/** normalise: a 2000 x 1500 JPEG working copy per file (override with `.normalise.mockImplementation`); decode answers with the working copy's size; encode returns a small JPEG. */
export function createFakeEngine(size = { width: 2000, height: 1500 }): FakeEngine {
  const sizes = new WeakMap<Blob, { width: number; height: number }>()
  let inFlight = 0
  let peak = 0
  const engine: FakeEngine = {
    sizes,
    maxParallelRenders: () => peak,
    browserOrients: vi.fn(async () => true),
    readHead: vi.fn(async () => new Uint8Array(0)),
    normalise: vi.fn(async (blob: Blob): Promise<Working> => {
      const working = new Blob([`work:${(blob as File).name ?? 'blob'}`], { type: 'image/jpeg' })
      sizes.set(working, size)
      return { blob: working, width: size.width, height: size.height, kept: false, original: size }
    }),
    decode: vi.fn(async (blob: Blob) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      const s = sizes.get(blob) ?? size
      return { width: s.width, height: s.height, close: vi.fn(() => void (inFlight -= 1)) }
    }),
    encode: vi.fn(async (_image, o) => new Blob([new Uint8Array(1000)], { type: o.type })),
  } as FakeEngine
  return engine
}

/** A counting stand-in for URL.createObjectURL / revokeObjectURL. */
export function createUrlLog() {
  let n = 0
  const live = new Set<string>()
  const created: Array<{ url: string; blob: Blob }> = []
  return {
    created,
    live,
    api: {
      create: vi.fn((blob: Blob) => {
        const url = `blob:fake/${++n}`
        live.add(url)
        created.push({ url, blob })
        return url
      }),
      revoke: vi.fn((url: string) => void live.delete(url)),
    },
  }
}

export type SpyStore = PhotoStore & { [K in keyof PhotoStore]: ReturnType<typeof vi.fn> & PhotoStore[K] }

/** A memory store whose every method is a spy that still works. */
export function createSpyStore(inner: PhotoStore = createMemoryPhotoStore()): SpyStore {
  return {
    load: vi.fn(() => inner.load()),
    keys: vi.fn(() => inner.keys()),
    save: vi.fn((r) => inner.save(r)),
    update: vi.fn((id, c) => inner.update(id, c)),
    remove: vi.fn((id) => inner.remove(id)),
    clear: vi.fn(() => inner.clear()),
  } as SpyStore
}

/** A File with a made-up size (no 31 MB allocation). */
export function fileOfSize(name: string, type: string, size: number): File {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u24le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255]

/** A PNG header (signature + IHDR) of the given size. */
export function pngHeader(width: number, height: number): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...u32be(width), ...u32be(height), 8, 6, 0, 0, 0])
}
/** A WebP VP8X header of the given canvas size. */
export function webpHeader(width: number, height: number): Uint8Array {
  const tag = (s: string) => [...s].map((c) => c.charCodeAt(0))
  return Uint8Array.from([...tag('RIFF'), 30, 0, 0, 0, ...tag('WEBP'), ...tag('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)])
}
/** A JPEG: SOI then a baseline SOF0 of the given size (each side at most 65535). */
export function jpegHeader(width: number, height: number): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, (height >> 8) & 255, height & 255, (width >> 8) & 255, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
}

// --- the signed-in User -------------------------------------------------------------------------------------------------------
// usePhotoPages reads the User's id from app/useMe (records on the device carry it). Test files mock the module with:
//   vi.mock('../../../app/useMe', async () => (await import('../fakeReadEngine.test-helper')).useMeModule())
export const meHolder: { data: { id: number; email: string; displayName: string; isAdmin: boolean } | null | undefined } = {
  data: { id: 7, email: 'ann@example.com', displayName: 'Ann', isAdmin: false },
}
export const useMeModule = () => ({ useMe: () => ({ data: meHolder.data, isPending: meHolder.data === undefined, isError: false }), ME_QUERY_KEY: ['me'] })

/** A spy store over a memory store; `inner` is the real one behind it (seed it, read it back). */
export function createMemorySpyStore() {
  const inner = createMemoryPhotoStore()
  return { spy: createSpyStore(inner), inner }
}
