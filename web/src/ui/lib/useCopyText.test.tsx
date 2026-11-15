// B9-52 (SET-03): useCopyText() -> { copy(text): Promise<boolean> }. true = the text is on the clipboard; false = it is not (no
// clipboard, a refusal, a throw). It never rejects and never opens a native prompt: the caller shows the fallback sheet on false.
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCopyText } from './useCopyText'

afterEach(() => vi.unstubAllGlobals())

const withClipboard = (writeText: unknown) => vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: writeText === undefined ? undefined : { writeText } })

describe('useCopyText', () => {
  it('writes the text to the clipboard and says true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    withClipboard(writeText)
    const { result } = renderHook(() => useCopyText())
    await expect(result.current.copy('Hello there')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('Hello there')
  })

  it('says false when the clipboard refuses (permission denied)', async () => {
    withClipboard(vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')))
    const { result } = renderHook(() => useCopyText())
    await expect(result.current.copy('x')).resolves.toBe(false)
  })

  it('says false when writeText throws at once', async () => {
    withClipboard(
      vi.fn(() => {
        throw new Error('boom')
      }),
    )
    const { result } = renderHook(() => useCopyText())
    await expect(result.current.copy('x')).resolves.toBe(false)
  })

  it('says false when there is no clipboard at all (an insecure page)', async () => {
    withClipboard(undefined)
    const { result } = renderHook(() => useCopyText())
    await expect(result.current.copy('x')).resolves.toBe(false)
  })

  it('never uses a native prompt or the legacy execCommand', async () => {
    withClipboard(undefined)
    const prompt = vi.fn()
    const exec = vi.fn()
    vi.stubGlobal('prompt', prompt)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
    const { result } = renderHook(() => useCopyText())
    await result.current.copy('x')
    expect(prompt).not.toHaveBeenCalled()
    expect(exec).not.toHaveBeenCalled()
  })
})
