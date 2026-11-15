import { describe, expect, it, vi } from 'vitest'
import { actionFailed, failureToast, fallbackMessage, saveFailed } from './errorCopy'
import { ApiError } from './http'

// B9-20 (RES-06): a failed save says what failed, and what the person can do. GLOSSARY words; curly apostrophes.
const server = new ApiError(500, 'internal', 'boom')
const offline = new ApiError(0, 'network', 'The network is unreachable')

describe('saveFailed', () => {
  it('a server failure: WarningCircle, "Couldn’t save {thing}", the choices are still on the screen, Try again', () => {
    expect(saveFailed('your preferences', server, { online: true })).toEqual({
      icon: 'error',
      headline: 'Couldn’t save your preferences',
      body: 'Your choices are still on the screen.',
      retryable: true,
    })
  })

  it('names the thing in GLOSSARY words, as given', () => {
    expect(saveFailed('Anna', server, { online: true }).headline).toBe('Couldn’t save Anna')
    expect(saveFailed('the Dinner Meal Slot', server, { online: true }).headline).toBe('Couldn’t save the Dinner Meal Slot')
    expect(saveFailed('the Tags', server, { online: true }).headline).toBe('Couldn’t save the Tags')
  })

  it('offline (a network error): CloudSlash, "Feeder is offline", no retry', () => {
    expect(saveFailed('your preferences', offline, { online: true })).toEqual({
      icon: 'offline',
      headline: 'Couldn’t save your preferences',
      subline: 'Feeder is offline',
      body: 'Try again when you’re back online. Your choices are still on the screen.',
      retryable: false,
    })
  })

  it('offline by the browser flag with any error: the offline copy', () => {
    const copy = saveFailed('your preferences', server, { online: false })
    expect(copy.icon).toBe('offline')
    expect(copy.retryable).toBe(false)
    expect(copy.subline).toBe('Feeder is offline')
  })

  it('a timeout is a server failure with Try again (pinned choice: the connection is there, the server did not answer)', () => {
    const copy = saveFailed('your preferences', new ApiError(0, 'timeout', 'x'), { online: true })
    expect(copy.icon).toBe('error')
    expect(copy.retryable).toBe(true)
  })

  it('an error that is not an ApiError is the server copy', () => {
    expect(saveFailed('your preferences', new Error('x'), { online: true }).icon).toBe('error')
  })

  it('a known 4xx code keeps its specific message as one line: no body, no subline, no retry', () => {
    const known = { last_admin: 'The Household needs at least one Admin.' }
    expect(saveFailed('Anna', new ApiError(409, 'last_admin', 'x'), { known, online: true })).toEqual({
      icon: 'error',
      headline: 'The Household needs at least one Admin.',
      retryable: false,
    })
  })

  it('a code that is not in `known` falls through to the generic copy', () => {
    expect(saveFailed('Anna', new ApiError(409, 'other', 'x'), { known: { last_admin: 'x' }, online: true }).headline).toBe('Couldn’t save Anna')
  })

  it('reads navigator.onLine when `online` is not given', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(saveFailed('your preferences', server).icon).toBe('offline')
    spy.mockRestore()
  })

  it('never shows raw client text, a stack or a status code', () => {
    const copy = saveFailed('your preferences', new ApiError(500, 'internal', 'pq: deadlock detected'), { online: true })
    expect(JSON.stringify(copy)).not.toMatch(/pq:|deadlock|500|network is unreachable/i)
  })
})

describe('serverMessage', () => {
  it('a 4xx with a message of its own is that one line when asked; never for a 5xx', () => {
    const refusal = new ApiError(409, 'not_on_list', 'That line is not on the list.')
    expect(saveFailed('x', refusal, { serverMessage: true, online: true })).toEqual({ icon: 'error', headline: 'That line is not on the list.', retryable: false })
    expect(saveFailed('x', refusal, { online: true }).headline).toBe('Couldn’t save x')
    expect(saveFailed('x', new ApiError(500, 'internal', 'pq: deadlock'), { serverMessage: true, online: true }).headline).toBe('Couldn’t save x')
  })
})

describe('actionFailed (a Shop action)', () => {
  it('the headline is "Couldn’t {phrase}" with the same body and retry', () => {
    expect(actionFailed('mark Cauliflower Not needed', server, { online: true })).toEqual({
      icon: 'error',
      headline: 'Couldn’t mark Cauliflower Not needed',
      body: 'Your choices are still on the screen.',
      retryable: true,
    })
  })
  it('saveFailed is actionFailed("save …")', () => {
    expect(saveFailed('the Tags', server, { online: true })).toEqual(actionFailed('save the Tags', server, { online: true }))
  })
})

describe('failureToast: the rich Toast content', () => {
  it('a retryable failure is an error toast with title, body and one Try again action that runs the same save', () => {
    const retry = vi.fn()
    const t = failureToast(saveFailed('your preferences', server, { online: true }), retry)
    expect(t).toMatchObject({ status: 'error', title: 'Couldn’t save your preferences', body: 'Your choices are still on the screen.' })
    expect(t.subline).toBeUndefined()
    expect(t.actions).toHaveLength(1)
    expect(t.actions![0]!.label).toBe('Try again')
    t.actions![0]!.onClick()
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('an offline failure is an offline toast: the subline, the body, and no action', () => {
    const t = failureToast(saveFailed('your preferences', offline, { online: true }), vi.fn())
    expect(t.status).toBe('offline')
    expect(t.subline).toBe('Feeder is offline')
    expect(t.actions ?? []).toHaveLength(0)
  })

  it('a retryable failure with no retry callback offers no action', () => {
    expect(failureToast(saveFailed('your preferences', server, { online: true })).actions ?? []).toHaveLength(0)
  })

  it('a known 4xx is a one-line error toast', () => {
    const t = failureToast(saveFailed('Anna', new ApiError(409, 'last_admin', 'x'), { known: { last_admin: 'The Household needs at least one Admin.' }, online: true }), vi.fn())
    expect(t).toMatchObject({ status: 'error', title: 'The Household needs at least one Admin.' })
    expect(t.body).toBeUndefined()
    expect(t.actions ?? []).toHaveLength(0)
  })
})

describe('fallbackMessage: the one sentence a form shows inline when no code is known', () => {
  it('says the choices are still there, and replaces "Something went wrong. Please try again."', () => {
    expect(fallbackMessage(server, { online: true })).toBe('Couldn’t save. Your choices are still on the screen.')
  })
  it('offline: says so and what to do', () => {
    expect(fallbackMessage(offline, { online: true })).toBe('Feeder is offline. Try again when you’re back online.')
  })
})
