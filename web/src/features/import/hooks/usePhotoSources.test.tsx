// usePhotoSources: which sources the Photo tab offers (docs/dev/design/photo-read.md section 4.4; decision 1: no live viewfinder).
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCEPT } from '../../../ui'
import { usePhotoSources } from './usePhotoSources'

const stubDevice = ({ coarse, getUserMedia }: { coarse: boolean; getUserMedia: boolean }) => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q.includes('pointer: coarse'), media: q, addEventListener() {}, removeEventListener() {} }))
  const gum = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: getUserMedia ? { getUserMedia: gum } : undefined })
  return gum
}
afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
})

describe('usePhotoSources', () => {
  it('a phone with getUserMedia still gets Take photo (the system camera), never a viewfinder; library takes any image, several at once; no paste hint', () => {
    const gum = stubDevice({ coarse: true, getUserMedia: true })
    const { result } = renderHook(() => usePhotoSources())
    expect(result.current).toEqual({ showTakePhoto: true, libraryAccept: 'image/*', multiple: true, pasteAndDrop: false })
    expect(gum).not.toHaveBeenCalled()
  })
  it('a phone without getUserMedia gets Take photo too', () => {
    stubDevice({ coarse: true, getUserMedia: false })
    expect(renderHook(() => usePhotoSources()).result.current.showTakePhoto).toBe(true)
  })
  it('a computer with a webcam gets no Take photo: files, paste and drop, with the picker\'s accept list', () => {
    const gum = stubDevice({ coarse: false, getUserMedia: true })
    const { result } = renderHook(() => usePhotoSources())
    expect(result.current).toEqual({ showTakePhoto: false, libraryAccept: ACCEPT, multiple: true, pasteAndDrop: true })
    expect(gum).not.toHaveBeenCalled()
  })
  it('a computer without getUserMedia is the same', () => {
    stubDevice({ coarse: false, getUserMedia: false })
    expect(renderHook(() => usePhotoSources()).result.current).toMatchObject({ showTakePhoto: false, pasteAndDrop: true, libraryAccept: ACCEPT })
  })
  it('without matchMedia (jsdom, old browsers) it is the computer presentation', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(renderHook(() => usePhotoSources()).result.current.showTakePhoto).toBe(false)
  })
})
