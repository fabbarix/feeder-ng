// Reads this feature's stylesheet as text for contract tests (vitest blanks CSS imports; @types/node is not installed).
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/

/** Text of any file under web/src/ (for source-scan contract tests); '' when missing. */
export function readSource(relativeToSrc: string): string {
  try {
    return readFileSync(`${cwd}/src/${relativeToSrc}`, 'utf8')
  } catch {
    return ''
  }
}

/** Text of web/src/features/plan/<name>; '' when missing, so the tests that need it fail one by one. */
export function readFeatureCss(name: string): string {
  try {
    return readFileSync(`${cwd}/src/features/plan/${name}`, 'utf8')
  } catch {
    return ''
  }
}
