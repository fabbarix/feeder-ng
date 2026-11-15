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
