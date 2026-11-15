// B9-46: the Away writes. Each is one call; each refreshes the plan and the Member's Aways (the plan is replanned by the server).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { mockApi } from '../test-utils'
import { useAway } from './useAway'

const away = { id: 9, memberId: 2, memberName: 'Ben', from: '2026-11-17', fromMealSlotId: null, through: '2026-11-19', throughMealSlotId: null, started: false }
function setup(handlers: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const api = mockApi(handlers)
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
  return { api, spy, hook: renderHook(() => useAway(), { wrapper: wrap }).result }
}
const refreshed = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey))

describe('useAway', () => {
  it('preview: POST /api/members/{id}/away?dryRun=1, or PATCH /api/away/{id}?dryRun=1 for an existing Away; nothing is refreshed', async () => {
    const dry = { slotsWithout: 1, mealsChanged: 1, days: [], beyondHorizon: null }
    const { api, spy, hook } = setup({ 'POST /api/members/2/away?dryRun=1': dry, 'PATCH /api/away/9?dryRun=1': dry })
    await expect(hook.current.preview(2, { from: '2026-11-17' })).resolves.toEqual(dry)
    await hook.current.preview(2, { through: null }, 9)
    expect(api.callsTo('POST', '/api/members/2/away?dryRun=1')[0]!.body).toEqual({ from: '2026-11-17' })
    expect(api.callsTo('PATCH', '/api/away/9?dryRun=1')[0]!.body).toEqual({ through: null })
    expect(spy).not.toHaveBeenCalled()
  })

  it('create: POST /api/members/{id}/away; the answer carries the Away, the changes and the undo token; the plan and the Aways refresh', async () => {
    const { api, spy, hook } = setup({ 'POST /api/members/2/away': { status: 201, json: { ...away, changes: [], undoToken: 'tok' } } })
    const out = await hook.current.create(2, { from: '2026-11-17', through: '2026-11-19' })
    expect(out.undoToken).toBe('tok')
    expect(out.away).toMatchObject({ id: 9, memberName: 'Ben' })
    expect(api.callsTo('POST', '/api/members/2/away')[0]!.body).toEqual({ from: '2026-11-17', through: '2026-11-19' })
    expect(refreshed(spy)).toEqual(expect.arrayContaining([JSON.stringify(['plan']), JSON.stringify(['household', 'away'])]))
  })

  it('update, end and remove call PATCH /api/away/{id}, POST /api/away/{id}/end and DELETE /api/away/{id}', async () => {
    const { api, spy, hook } = setup({
      'PATCH /api/away/9': { ...away, changes: [], undoToken: 'a' },
      'POST /api/away/9/end': { ...away, started: true, changes: [], undoToken: 'b' },
      'DELETE /api/away/9': { id: 9, changes: [], undoToken: 'c' },
    })
    expect((await hook.current.update(9, { through: null })).undoToken).toBe('a')
    expect((await hook.current.end(9)).undoToken).toBe('b')
    expect(await hook.current.remove(9)).toMatchObject({ id: 9, undoToken: 'c' })
    expect(api.callsTo('PATCH', '/api/away/9')[0]!.body).toEqual({ through: null })
    expect(api.callsTo('POST', '/api/away/9/end')).toHaveLength(1)
    expect(api.callsTo('DELETE', '/api/away/9')).toHaveLength(1)
    expect(refreshed(spy).filter((k: string) => k === JSON.stringify(['household', 'away'])).length).toBeGreaterThanOrEqual(3)
  })

  it('a refusal rejects with the server\'s error (code, reason and field kept)', async () => {
    const { hook } = setup({ 'POST /api/members/2/away': { status: 422, json: { error: { code: 'validation_failed', message: 'x', field: 'from', reason: 'overlap' } } } })
    await expect(hook.current.create(2, { from: '2026-11-17' })).rejects.toMatchObject({ status: 422, code: 'validation_failed', details: { field: 'from', reason: 'overlap' } })
  })
})
