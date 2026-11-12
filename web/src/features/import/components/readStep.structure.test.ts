// Structure of "Read a recipe": built from the shared primitives, no DOM patches, no deep imports into ui/.
import { describe, expect, it } from 'vitest'
import { readSource } from '../../plan/test-css'

const nodeFs = 'node:fs'
const { readdirSync, readFileSync, statSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readdirSync: (p: string) => string[]
  readFileSync: (p: string, enc: string) => string
  statSync: (p: string) => { isDirectory(): boolean }
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

/** The files of the photo read (docs/dev/design/photo-read.md section 9.1): barrel-only imports from ui/. */
const PHOTO_READ_FILES = [
  'components/ReadRecipeStep.tsx',
  'components/ReadPhotoPanel.tsx',
  'components/PhotoSources.tsx',
  'components/PhotoList.tsx',
  'components/PhotoRow.tsx',
  'components/PhotoEditorPanel.tsx',
  'components/ReviewPhotoChoice.tsx',
  'components/ReadProgress.tsx',
  'components/ReadErrorTile.tsx',
  'hooks/usePhotoPages.ts',
  'hooks/usePhotoSources.ts',
  'lib/photoPages.ts',
  'types.ts',
]

describe('Read a recipe structure', () => {
  it('uses Segmented for the input choice: ReadSourceChoice and useDescribedBy are gone', () => {
    expect(readSource('features/import/components/ReadSourceChoice.tsx')).toBe('')
    expect(readSource('features/import/hooks/useDescribedBy.ts')).toBe('')
    const step = readSource('features/import/components/ReadRecipeStep.tsx')
    expect(step).toMatch(/Segmented/)
    expect(step).not.toMatch(/useDescribedBy|ReadSourceChoice/)
  })
  it('passes the reason to the fields as aria-describedby', () => {
    expect(readSource('features/import/components/ReadRecipeStep.tsx')).toMatch(/aria-describedby=\{describedBy\}/)
  })
  it('no file of the import feature imports from ui/ below the barrel', () => {
    for (const f of ['ReadRecipeStep', 'ReadPhotoPanel', 'ReviewPhotoChoice', 'ReadProgress', 'ReadErrorTile']) {
      expect(readSource(`features/import/components/${f}.tsx`), f).not.toMatch(/from '\.\.\/\.\.\/\.\.\/ui\//)
    }
  })
  it('every file of the photo read exists and imports from ui/ through the barrel only (any depth)', () => {
    for (const f of PHOTO_READ_FILES) {
      const src = readSource(`features/import/${f}`)
      expect(src, `${f} is missing`).not.toBe('')
      expect(src, f).not.toMatch(/from '(\.\.\/)+ui\//)
    }
  })
  it('the ImagePicker slots are gone: photoSlots and the fake picker no longer exist', () => {
    expect(readSource('features/import/lib/photoSlots.ts')).toBe('')
    expect(readSource('features/import/lib/photoSlots.test.ts')).toBe('')
    expect(readSource('features/import/fakeImagePicker.test-helper.tsx')).toBe('')
  })
  it('no non-test source of features/import names getUserMedia, CameraPanel, useCameraCapture or ImagePicker (comments included)', () => {
    const files = walk(`${cwd}/src/features/import`).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test(-helper)?\.(ts|tsx)$/.test(f) && !/\.test-helper\./.test(f))
    expect(files.length).toBeGreaterThan(20)
    const hits = files.filter((f) => /getUserMedia|CameraPanel|useCameraCapture|ImagePicker/.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
  it('the stand-in block of photoPages.ts is gone: it imports ImageEdit, Rect, Size, initialEdit, isFullEdit, outputSize and READ_MAX_SIDE from the ui barrel', () => {
    const src = readSource('features/import/lib/photoPages.ts')
    expect(src).not.toMatch(/Stand-ins|stand-ins/)
    expect(src).not.toMatch(/export const READ_MAX_SIDE\s*=/)
    expect(src).not.toMatch(/export function (initialEdit|isFull|outputSize)\b/)
    const barrel = src.match(/import (?:type )?\{([^}]*)\} from '(?:\.\.\/)+ui'/g)?.join(' ') ?? ''
    for (const name of ['ImageEdit', 'Rect', 'Size', 'initialEdit', 'isFullEdit', 'outputSize', 'READ_MAX_SIDE']) expect(barrel, name).toMatch(new RegExp(`\\b${name}\\b`))
  })
  it('the components render only: none calls the API, the engine or the store, and none builds an object URL', () => {
    for (const f of ['ReadPhotoPanel', 'PhotoSources', 'PhotoList', 'PhotoRow', 'PhotoEditorPanel']) {
      const src = readSource(`features/import/components/${f}.tsx`)
      expect(src, f).not.toMatch(/importApi|createObjectURL|browserImageEngine|appPhotoStore|createPhotoWriter|indexedDB|fetch\(/)
    }
  })
  it('the read design no longer says nothing is persisted', () => {
    expect(readSource('../../docs/dev/design/photo-read.md')).not.toMatch(/nothing is persisted/)
  })
})
