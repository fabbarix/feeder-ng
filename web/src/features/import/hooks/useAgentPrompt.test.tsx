import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ agentPrompt: vi.fn() }))
vi.mock('../api', () => ({ importApi: api }))

import { useAgentPrompt } from './useAgentPrompt'

describe('useAgentPrompt', () => {
  const writeText = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    api.agentPrompt.mockResolvedValue('THE PROMPT')
    writeText.mockResolvedValue(undefined)
  })
  it('copies the prompt text to the clipboard', async () => {
    const { result } = renderHook(() => useAgentPrompt())
    expect(result.current.state).toBe('idle')
    await act(() => result.current.copy())
    expect(writeText).toHaveBeenCalledWith('THE PROMPT')
    expect(result.current.state).toBe('copied')
  })
  it('fails when the prompt cannot be fetched', async () => {
    api.agentPrompt.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useAgentPrompt())
    await act(() => result.current.copy())
    expect(writeText).not.toHaveBeenCalled()
    expect(result.current.state).toBe('failed')
  })
  it('fails when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const { result } = renderHook(() => useAgentPrompt())
    await act(() => result.current.copy())
    expect(result.current.state).toBe('failed')
  })
})
