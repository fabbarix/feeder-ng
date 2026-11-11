import { describe, expect, it } from 'vitest'
import { WAITING_PATH, waitingKind } from './waitingView'

describe('waitingKind', () => {
  it('waits by default', () => {
    expect(waitingKind('')).toBe('waiting')
    expect(waitingKind('?state=')).toBe('waiting')
  })
  it('knows limited and full', () => {
    expect(waitingKind('?state=limited')).toBe('limited')
    expect(waitingKind('?state=full')).toBe('full')
  })
  it('ignores anything else', () => {
    expect(waitingKind('?state=<script>')).toBe('waiting')
    expect(waitingKind('?state=approved')).toBe('waiting')
  })
  it('names the path the server redirects to', () => {
    expect(WAITING_PATH).toBe('/waiting-for-approval')
  })
})
