// SR4: the old scan line, live list and Edit price sheet are gone (shop-scan-proposals.md 13.6, 13.10): nothing uses them.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { existsSync, readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { existsSync: (p: string) => boolean; readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const scan = `${cwd}/src/features/scan`

describe('removed components', () => {
  it.each(['components/ScanFeedback.tsx', 'components/LiveList.tsx', 'components/PriceEditSheet.tsx'])('%s is gone', (file) => {
    expect(existsSync(`${scan}/${file}`)).toBe(false)
  })

  it('the Scan screen no longer mentions them', () => {
    const screen = readFileSync(`${scan}/screens/ScanScreen.tsx`, 'utf8')
    for (const name of ['ScanFeedback', 'LiveList', 'PriceEditSheet', 'openEditPrice']) expect(screen).not.toContain(name)
    expect(screen).toContain('PriceEntrySheet')
    expect(screen).toContain('ScannedList')
  })

  it('the flow has no scan line and no Edit price path left (SR4 review), and its text builder is gone', () => {
    expect(existsSync(`${scan}/lib/toast.ts`)).toBe(false)
    const flow = readFileSync(`${scan}/hooks/useScanFlow.ts`, 'utf8')
    for (const name of ['openEditPrice', 'editPrice', 'dismissFeedback', 'edit_price', 'FlowFeedback', 'feedbackText', 'setLine']) expect(flow).not.toContain(name)
  })

  it('the Scan screen never calls native alert, confirm or prompt', () => {
    const files = ['screens/ScanScreen.tsx', 'components/ScannedList.tsx', 'components/ScannedRow.tsx', 'components/PriceEntrySheet.tsx']
    for (const f of files) expect(readFileSync(`${scan}/${f}`, 'utf8')).not.toMatch(/\b(?:window\.)?(?:alert|confirm|prompt)\(/)
  })
})
