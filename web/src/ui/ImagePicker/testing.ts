// Test helpers for the ImagePicker suites (not shipped: only *.test.* files import it).
import { createEvent, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import type { ClipboardLike } from './lib/clipboard'
import type { DecodedImage, ImageEngine } from './lib/prepare'
import type { ImageApi, ImagePickerDeps, MediaDevicesLike, StoredImage } from './types'

export const ID_A = 'a'.repeat(32)
export const ID_B = 'b'.repeat(32)
export const ID_C = 'c'.repeat(32)

export const pngFile = (name = 'soup.png', bytes = 64) => new File([new Uint8Array(bytes)], name, { type: 'image/png' })
export const jpegFile = (name = 'soup.jpg', bytes = 64) => new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' })
export const gifFile = () => new File([new Uint8Array(16)], 'anim.gif', { type: 'image/gif' })
export const heicFile = () => new File([new Uint8Array(16)], 'IMG_0001.heic', { type: 'image/heic' })
export const pdfFile = () => new File([new Uint8Array(16)], 'menu.pdf', { type: 'application/pdf' })
export const hugeFile = () => new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' })

export const stored = (id: string, width = 800, height = 600): StoredImage => ({ id, url: `/api/images/${id}`, width, height })

export type FakeApi = { [K in keyof ImageApi]: ReturnType<typeof vi.fn> & ImageApi[K] }

export function fakeApi(over: Partial<ImageApi> = {}): FakeApi {
  return {
    uploadDataUrl: vi.fn(async () => stored(ID_A)),
    ingestUrl: vi.fn(async () => stored(ID_B)),
    discard: vi.fn(async () => {}),
    loadBlob: vi.fn(async () => new Blob([new Uint8Array(8)], { type: 'image/webp' })),
    ...over,
  } as FakeApi
}

export interface FakeEngine extends ImageEngine {
  size: { width: number; height: number }
  decoded: (DecodedImage & { close: ReturnType<typeof vi.fn> })[]
  decode: ReturnType<typeof vi.fn> & ImageEngine['decode']
  encode: ReturnType<typeof vi.fn> & ImageEngine['encode']
}

/** An engine whose pictures are `size` big (800x600 by default, which needs no change) and whose encodings are small Blobs. */
export function fakeEngine(size = { width: 800, height: 600 }): FakeEngine {
  const engine = {
    size,
    decoded: [] as FakeEngine['decoded'],
    decode: vi.fn(async () => {
      const img = { width: engine.size.width, height: engine.size.height, close: vi.fn() }
      engine.decoded.push(img)
      return img
    }),
    encode: vi.fn(async (_img: DecodedImage, o: { type: string }) => new Blob([new Uint8Array(100)], { type: o.type })),
  }
  return engine as unknown as FakeEngine
}

export function fakeStream() {
  const track = { stop: vi.fn(), getCapabilities: vi.fn(() => ({ torch: true })), applyConstraints: vi.fn(async () => {}) }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
  return { stream, track }
}

export type FakeMedia = MediaDevicesLike & { getUserMedia: ReturnType<typeof vi.fn> }

/** A getUserMedia that resolves with a fake stream (or rejects with a DOMException-like error named `rejectWith`). */
export function fakeMedia(opts: { rejectWith?: string; cameras?: number } = {}): { media: FakeMedia; track: ReturnType<typeof fakeStream>['track'] } {
  const { stream, track } = fakeStream()
  const media: FakeMedia = {
    getUserMedia: vi.fn(() => (opts.rejectWith ? Promise.reject(Object.assign(new Error('no'), { name: opts.rejectWith })) : Promise.resolve(stream))),
    enumerateDevices: vi.fn(async () => Array.from({ length: opts.cameras ?? 1 }, () => ({ kind: 'videoinput' }))),
  }
  return { media, track }
}

export function fakeClipboard(opts: { image?: Blob; text?: string; denied?: boolean } = {}): ClipboardLike & { read: ReturnType<typeof vi.fn> } {
  const denied = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
  return {
    read: vi.fn(async () => {
      if (opts.denied) return denied()
      if (opts.image) return [{ types: [opts.image.type], getType: async () => opts.image! }]
      if (opts.text) return [{ types: ['text/plain'], getType: async () => new Blob([opts.text!], { type: 'text/plain' }) }]
      return []
    }),
    readText: vi.fn(async () => (opts.denied ? denied() : (opts.text ?? ''))),
  }
}

/** Test deps: no camera API, no clipboard API, a fake API and engine. */
export function fakeDeps(over: Partial<ImagePickerDeps> = {}): ImagePickerDeps & { api: FakeApi; engine: FakeEngine } {
  return {
    api: fakeApi(),
    engine: fakeEngine(),
    mediaDevices: null,
    clipboard: null,
    grabFrame: vi.fn(async () => new Blob([new Uint8Array(32)], { type: 'image/jpeg' })),
    objectUrls: { create: vi.fn(() => 'blob:preview-1'), revoke: vi.fn() },
    ...over,
  } as ImagePickerDeps & { api: FakeApi; engine: FakeEngine }
}

export interface PasteInit {
  files?: File[]
  text?: string
  html?: string
}

/** Fires a paste event with a clipboardData shaped like the browser's. Returns the event (read `defaultPrevented`). */
export function paste(target: Element, init: PasteInit) {
  const event = createEvent.paste(target)
  const items = (init.files ?? []).map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f }))
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: init.files ?? [],
      items,
      types: [...(init.files?.length ? ['Files'] : []), ...(init.text ? ['text/plain'] : []), ...(init.html ? ['text/html'] : [])],
      getData: (type: string) => (type === 'text/plain' ? (init.text ?? '') : type === 'text/html' ? (init.html ?? '') : ''),
    },
  })
  fireEvent(target, event)
  return event
}

export function drop(zone: Element, files: File[]) {
  const event = createEvent.drop(zone)
  Object.defineProperty(event, 'dataTransfer', { value: { files, types: ['Files'] } })
  fireEvent(zone, event)
}
