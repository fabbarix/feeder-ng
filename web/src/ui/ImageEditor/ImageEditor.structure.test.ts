import { describe, expect, it } from 'vitest'

// @types/node is not installed: node:fs through an untyped dynamic import (as ../test-utils.ts does).
const nodeFs = 'node:fs'
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, enc: string) => string
  readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[]
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/
const ROOT = `${cwd}/src/ui/ImageEditor`

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))
}

const isTest = (path: string) => /\.test\.|\.test-helper\./.test(path)

describe('ui/ImageEditor layering (photo-read.md, section 9)', () => {
  const sources = files(ROOT).filter((f) => !isTest(f))

  it('has sources to check', () => {
    expect(sources.length).toBeGreaterThan(5)
  })

  it('no non-test file under ui/ImageEditor mentions ImagePicker (it never imports the picker)', () => {
    const offenders = sources.filter((f) => /ImagePicker/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
