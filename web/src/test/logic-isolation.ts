// fast-checks: the "logic" vitest project runs its files in shared workers without per-file isolation (vite.config.ts). What a file
// leaves behind for the next file in the same worker is reset when it ends: fake timers (a FileReader in the next file would never
// call back), spies and mocks. Globals and env stubs are reset after every test (unstubGlobals, unstubEnvs).
import { afterAll, vi } from 'vitest'

afterAll(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
