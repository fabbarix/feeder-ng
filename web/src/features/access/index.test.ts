import { describe, expect, it } from 'vitest'
import { collectFeatures } from '../../app/features'
import * as access from './index'

describe('the access feature', () => {
  it('owns /settings/access-requests', () => {
    expect(access.routes.map((r) => r.path)).toContain('/settings/access-requests')
  })

  it('contributes the shell badge hook, so the shell needs no knowledge of Access Requests beyond the count', () => {
    const { statusHooks } = collectFeatures({ access: access as never })
    expect(statusHooks.length).toBe(1)
  })
})
