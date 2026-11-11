// TextField and TextArea merge a passed aria-describedby with their own helper and error ids (they used to overwrite it).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TextArea } from './TextArea'
import { TextField } from './TextField'

const noop = () => undefined
const ids = (el: HTMLElement) => (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)

describe.each([
  ['TextField', (p: { helper?: string; error?: string; d?: string }) => <TextField label="Name" value="" onChange={noop} helper={p.helper} error={p.error} aria-describedby={p.d} />],
  ['TextArea', (p: { helper?: string; error?: string; d?: string }) => <TextArea label="Name" value="" onChange={noop} helper={p.helper} error={p.error} aria-describedby={p.d} />],
])('%s aria-describedby', (_name, make) => {
  it('keeps a passed id when there is no helper or error', () => {
    render(<>{make({ d: 'why' })}<p id="why">Because</p></>)
    expect(ids(screen.getByLabelText('Name'))).toEqual(['why'])
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Because')
  })
  it('adds its helper id next to the passed one', () => {
    render(<>{make({ d: 'why', helper: '0 of 50' })}<p id="why">Because</p></>)
    const field = screen.getByLabelText('Name')
    expect(ids(field)).toHaveLength(2)
    expect(ids(field)).toContain('why')
    expect(field).toHaveAccessibleDescription(/0 of 50/)
    expect(field).toHaveAccessibleDescription(/Because/)
  })
  it('adds helper and error ids next to the passed one', () => {
    render(<>{make({ d: 'why', helper: 'Help', error: 'Bad' })}<p id="why">Because</p></>)
    const field = screen.getByLabelText('Name')
    expect(ids(field)).toHaveLength(3)
    expect(field).toHaveAccessibleDescription(/Help/)
    expect(field).toHaveAccessibleDescription(/Bad/)
    expect(field).toHaveAccessibleDescription(/Because/)
  })
  it('without a passed id it behaves as before', () => {
    render(make({ helper: 'Help' }))
    expect(ids(screen.getByLabelText('Name'))).toHaveLength(1)
  })
})
