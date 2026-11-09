import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importStrings as s } from '../strings'

const hook = vi.hoisted(() => ({ state: 'idle' as string, copy: vi.fn() }))
vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => hook }))

import { CopyAgentPromptButton } from './CopyAgentPromptButton'

describe('CopyAgentPromptButton', () => {
  beforeEach(() => {
    hook.state = 'idle'
    hook.copy.mockClear()
  })
  it('copies on click', async () => {
    render(<CopyAgentPromptButton />)
    await userEvent.click(screen.getByRole('button', { name: s.copyAgentPrompt }))
    expect(hook.copy).toHaveBeenCalledOnce()
  })
  it.each([
    ['copied', s.agentPromptCopied],
    ['failed', s.agentPromptFailed],
  ])('announces %s', (state, text) => {
    hook.state = state
    render(<CopyAgentPromptButton />)
    expect(screen.getByRole('status')).toHaveTextContent(text)
  })
})
