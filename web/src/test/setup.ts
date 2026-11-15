import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { installDialogPolyfill } from './dialogPolyfill'

installDialogPolyfill()
afterEach(() => cleanup())
// B9-20 (RES-02): useMe starts from the remembered User (app/meCache, key 'feeder.me'), so a User one test remembered must
// not sign the next test in as that User.
afterEach(() => {
  try {
    localStorage.removeItem('feeder.me')
  } catch {
    // no storage in this environment
  }
})
// B9-25 (PC-04): Cook Mode resumes at the last Step, kept per device in localStorage (feeder.cook.resume.<scope>); a Step one test
// saved must not move the next test's Cook Mode off its first Step.
afterEach(() => {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('feeder.cook.resume.')) localStorage.removeItem(key)
  } catch {
    // no storage in this environment
  }
})
