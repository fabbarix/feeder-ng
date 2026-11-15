// B9-49 (TB-14): the landing parameters a notification puts on "/" (internal/notify links.go): `?step=<scope>:<step>` (Advance Step due) and
// `?leftover=<id>` (Leftover Use-by). Plain TypeScript (lib/landing.ts); an unusable value is ignored.
import { describe, expect, it } from 'vitest'
import { parseLanding, withoutLanding } from './landing'

describe('parseLanding', () => {
  it('reads an Advance Step: the scope is everything before the last colon, the Step index is the number after it', () => {
    expect(parseLanding('?step=meal%3A2026-11-09%2F3%2F5%3A2')).toEqual({ step: { scope: 'meal:2026-11-09/3/5', index: 2 } })
    expect(parseLanding('?step=recipe:4:0')).toEqual({ step: { scope: 'recipe:4', index: 0 } })
  })

  it('reads a Leftover id', () => {
    expect(parseLanding('?leftover=17')).toEqual({ leftover: 17 })
  })

  it('reads both when both are there', () => {
    expect(parseLanding('?step=a:b:1&leftover=3')).toEqual({ step: { scope: 'a:b', index: 1 }, leftover: 3 })
  })

  it.each(['', '?', '?step=', '?step=nocolon', '?step=a:x', '?step=a:-1', '?step=:2', '?leftover=abc', '?leftover=0', '?leftover=-3', '?step=a:1.5', '?other=1'])('ignores %j', (search) => {
    expect(parseLanding(search)).toEqual({})
  })
})

describe('withoutLanding', () => {
  it('drops step and leftover and keeps every other parameter, in order', () => {
    expect(withoutLanding(new URLSearchParams('a=1&step=x:1&b=2&leftover=3')).toString()).toBe('a=1&b=2')
    expect(withoutLanding(new URLSearchParams('step=x:1')).toString()).toBe('')
  })
})
