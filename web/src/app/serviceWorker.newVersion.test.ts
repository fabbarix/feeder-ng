// B9-59 (RES-04): a route chunk of the old build is gone because a new version was deployed. The page announces the same
// "new version, Reload" update as a waiting worker does, and its Reload reloads the page.
import { describe, expect, it, vi } from 'vitest'
import { announceNewVersion, onAppUpdateReady, type UpdateControls } from './serviceWorker'

describe('announceNewVersion', () => {
  it('reaches the update listeners, now and later, and Reload reloads', async () => {
    const reload = vi.fn()
    const early: UpdateControls[] = []
    const stopEarly = onAppUpdateReady((c) => early.push(c))
    announceNewVersion(reload)
    expect(early).toHaveLength(1)
    // a shell that mounts later (after a crash) still gets it
    const late: UpdateControls[] = []
    const stopLate = onAppUpdateReady((c) => late.push(c))
    expect(late).toHaveLength(1)
    await expect(late[0]!.checkForUpdate()).resolves.toBeUndefined()
    late[0]!.applyUpdate()
    expect(reload).toHaveBeenCalledTimes(1)
    stopEarly()
    stopLate()
  })
})
