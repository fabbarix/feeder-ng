// R11a: BackLink is gone. Breadcrumbs are the one way up a hierarchy; scripts/check-ui.sh (rule back-link) guards the whole tree.
import { describe, expect, it } from 'vitest'
import * as ui from './index'

const nodeFs = 'node:fs'
const { readFileSync, readdirSync, statSync, existsSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, e: string) => string
  readdirSync: (p: string) => string[]
  statSync: (p: string) => { isDirectory: () => boolean }
  existsSync: (p: string) => boolean
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = `${dir}/${name}`
    if (statSync(p).isDirectory()) return sources(p)
    return /\.(tsx?|css)$/.test(name) && !/\.test\./.test(name) ? [p] : []
  })
}

describe('BackLink is removed', () => {
  it('the ui barrel exports Breadcrumbs and no BackLink', () => {
    expect(ui).toHaveProperty('Breadcrumbs')
    expect(ui).not.toHaveProperty('BackLink')
  })

  it('the component and its stylesheet are deleted', () => {
    expect(existsSync(`${cwd}/src/ui/BackLink.tsx`)).toBe(false)
    expect(existsSync(`${cwd}/src/ui/BackLink.css`)).toBe(false)
  })

  it('no source file mentions BackLink, back-link or uiStrings.backTo', () => {
    const offenders = sources(`${cwd}/src`)
      .filter((p) => /BackLink|back-link|backTo\(/.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('no catalogue or Settings screen keeps an inline "Back to ..." string or a back IconButton that navigates', () => {
    const offenders = sources(`${cwd}/src/features`)
      .filter((p) => /\/(settings|shops|notifications|plan|ingredients|products)\//.test(p))
      .filter((p) => {
        const t = readFileSync(p, 'utf8')
        return /backToShops|backToProducts|backToSettings/.test(t) || /<IconButton[^>]*icon="back"[^>]*navigate\(/.test(t)
      })
    expect(offenders).toEqual([])
  })
})
