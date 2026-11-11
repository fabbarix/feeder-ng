// R2-1 (G-01): the avatar menu uses the extracted keyboard hook instead of its own copy.
// Note for the PM: app/YourMenu.tsx is also edited by R2-3 (S-01). The change is confined to the key handlers.
import { describe, expect, it } from 'vitest'
import { readSource } from '../features/plan/test-css'

const source = readSource('app/YourMenu.tsx')

describe('YourMenu keyboard handling', () => {
  it('calls useMenuKeys from the ui barrel', () => {
    expect(source).toMatch(/useMenuKeys/)
    expect(source).toMatch(/from '\.\.\/ui'/)
  })
  it('no longer carries its own arrow-key switch', () => {
    expect(source).not.toMatch(/case 'ArrowDown'/)
    expect(source).not.toMatch(/case 'Home'/)
  })
})
