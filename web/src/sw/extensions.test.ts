import { describe, expect, it, vi } from 'vitest'
import { registerExtensions } from './extensions'

const sw = { addEventListener: vi.fn() }

describe('registerExtensions', () => {
  it('registers each extension once, in path order, with the worker scope', () => {
    const order: string[] = []
    const mod = (name: string) => ({ register: vi.fn(() => void order.push(name)) })
    const b = mod('b')
    const a = mod('a')
    const registered = registerExtensions({ './extensions/push.ts': b, './extensions/analytics.ts': a }, sw)
    expect(order).toEqual(['a', 'b'])
    expect(a.register).toHaveBeenCalledWith(sw)
    expect(registered).toEqual(['./extensions/analytics.ts', './extensions/push.ts'])
  })

  it('skips modules without a register function', () => {
    expect(registerExtensions({ './extensions/readme.ts': {} }, sw)).toEqual([])
  })

  it('an extension that throws does not stop the others', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const good = { register: vi.fn() }
    const registered = registerExtensions(
      {
        './extensions/a.ts': {
          register: () => {
            throw new Error('boom')
          },
        },
        './extensions/b.ts': good,
      },
      sw,
    )
    expect(good.register).toHaveBeenCalled()
    expect(registered).toEqual(['./extensions/b.ts'])
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('works with no extensions at all', () => {
    expect(registerExtensions({}, sw)).toEqual([])
  })
})
