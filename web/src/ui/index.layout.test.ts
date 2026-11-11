// R2-L: the barrel exports the layout primitives.
import { describe, expect, it } from 'vitest'
import * as ui from './index'

describe('ui barrel (R2-L)', () => {
  it('exports Page, PageWidthProvider, usePageWidth and StickyActionBar', () => {
    for (const name of ['Page', 'PageWidthProvider', 'usePageWidth', 'StickyActionBar']) {
      expect((ui as Record<string, unknown>)[name], name).toBeDefined()
    }
  })
})
