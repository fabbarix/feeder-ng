// Structure of "Read a recipe": built from the shared primitives, no DOM patches, no deep imports into ui/.
import { describe, expect, it } from 'vitest'
import { readSource } from '../../plan/test-css'

describe('Read a recipe structure', () => {
  it('uses Segmented for the input choice: ReadSourceChoice and useDescribedBy are gone', () => {
    expect(readSource('features/import/components/ReadSourceChoice.tsx')).toBe('')
    expect(readSource('features/import/hooks/useDescribedBy.ts')).toBe('')
    const step = readSource('features/import/components/ReadRecipeStep.tsx')
    expect(step).toMatch(/Segmented/)
    expect(step).not.toMatch(/useDescribedBy|ReadSourceChoice/)
  })
  it('passes the reason to the fields as aria-describedby', () => {
    expect(readSource('features/import/components/ReadRecipeStep.tsx')).toMatch(/aria-describedby=\{reason/)
  })
  it('no file of the import feature imports from ui/ below the barrel', () => {
    for (const f of ['ReadRecipeStep', 'ReadPhotoPanel', 'ReviewPhotoChoice', 'ReadProgress', 'ReadErrorTile']) {
      expect(readSource(`features/import/components/${f}.tsx`), f).not.toMatch(/from '\.\.\/\.\.\/\.\.\/ui\//)
    }
  })
})
