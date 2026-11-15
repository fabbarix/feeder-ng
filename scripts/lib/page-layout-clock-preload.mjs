// fast-checks: `node --import scripts/lib/page-layout-clock-preload.mjs seed.mjs` runs the seeder on the guard's test clock: with
// PAGE_LAYOUT_NOW (an ISO instant) set, Date in this process starts at that instant and ticks from there (page-layout/test-clock.mjs).
// It lives outside scripts/lib/page-layout/ on purpose: the registry loads every .mjs of that folder's subfolders only, and a
// preload must not be a guard module.
import { installNodeClock } from './page-layout/test-clock.mjs'

const at = process.env.PAGE_LAYOUT_NOW ? Date.parse(process.env.PAGE_LAYOUT_NOW) : NaN
if (process.env.PAGE_LAYOUT_NOW && Number.isNaN(at)) throw new Error(`PAGE_LAYOUT_NOW=${process.env.PAGE_LAYOUT_NOW} is not an instant`)
if (!Number.isNaN(at)) installNodeClock(at)
