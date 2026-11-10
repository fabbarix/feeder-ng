import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { importStrings as s } from '../strings'

const hook = vi.hoisted(() => ({ state: 'idle' as string, copy: vi.fn() }))
vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => hook }))

import { CopyAgentPromptButton } from './CopyAgentPromptButton'

const view = () =>
  render(
    <ToastProvider>
      <CopyAgentPromptButton />
    </ToastProvider>,
  )

describe('CopyAgentPromptButton', () => {
  beforeEach(() => {
    hook.state = 'idle'
    hook.copy.mockClear()
  })
  it('is a primary Button with a copy icon that copies on click', async () => {
    view()
    const button = screen.getByRole('button', { name: s.copyAgentPrompt })
    expect(button.querySelector('svg')).not.toBeNull()
    await userEvent.click(button)
    expect(hook.copy).toHaveBeenCalledOnce()
  })
  it('tells the User it was copied with a Toast, not a stray status line', () => {
    hook.state = 'copied'
    const { container } = view()
    expect(screen.getByText(s.agentPromptCopied)).toBeInTheDocument()
    expect(container.querySelector('p[role=status]')).toBeNull()
  })
  it('tells the User when copying failed, as an error Toast', () => {
    hook.state = 'failed'
    view()
    expect(screen.getByRole('alert')).toHaveTextContent(s.agentPromptFailed)
  })
  it('says nothing while idle', () => {
    view()
    expect(screen.queryByText(s.agentPromptCopied)).toBeNull()
    expect(screen.queryByText(s.agentPromptFailed)).toBeNull()
  })
})
