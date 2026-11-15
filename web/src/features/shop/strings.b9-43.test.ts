// B9-43: the copy the package adds (shopscan.md SSP-04, SSP-09, SSP-13, SSP-14 "Copy"), pinned word for word. The names of the strings
// are the developer's; this test finds them by their text through a walk of `shopStrings`.
import { describe, expect, it } from 'vitest'
import { shopStrings } from './strings'

type Leaf = string | ((...a: never[]) => string) | { [k: string]: Leaf }
function texts(node: Leaf, call: (f: (...a: never[]) => string) => string[]): string[] {
  if (typeof node === 'string') return [node]
  if (typeof node === 'function') return call(node)
  return Object.values(node).flatMap((n) => texts(n, call))
}
// every string and every function's output for a few sample arguments
const all = texts(shopStrings as unknown as Leaf, (f) => {
  const out: string[] = []
  for (const args of [['Onion'], ['Onion', 'Shallot'], [1], [2], [17], ['Coop'], ['$10.79'], ['Sat Dinner'], [3, 'Onion'], ['$2.99', '14 Nov'], ['Onion', 3]]) {
    try {
      out.push((f as (...a: unknown[]) => string)(...args))
    } catch {
      /* wrong arity */
    }
  }
  return out
})
const has = (s: string) => all.includes(s)

describe('shopStrings, B9-43', () => {
  it.each([
    'Not marked Cooked yet',
    'Mark it',
    'Shopping List complete',
    'Lines ticked',
    'Stock Lots added',
    'Read the receipt',
    'Every Line is ticked',
    'Put away 17 Stock Lots',
    'Put away 1 Stock Lot',
    '17 not sorted into a Storage Place yet',
    'Spent at Coop',
    'To get',
    'Estimated at Coop',
    'Change the Price',
    'No Product yet: scan one in the Shop',
    'For',
    'and 2 more',
    'Get something else…',
    'Not needed leaves these 3 Planned Meals short of Onion.',
    'Not needed leaves Sat Dinner short of Onion.',
    'Onion is Not needed; Shallot added',
  ])('has "%s"', (text) => {
    expect(has(text)).toBe(true)
  })

  it('has no lowercase "lines" fact left and no "isn\'t" or "aren\'t" sentence', () => {
    expect(all.some((s) => /^\d+ lines?$/.test(s))).toBe(false)
    expect(all.some((s) => /marked Cooked yet$/.test(s) && s !== 'Not marked Cooked yet' && !s.startsWith('Includes'))).toBe(false)
  })

  it('never uses a word GLOSSARY lists under _Avoid_ in the new copy ("Discard")', () => {
    expect(all.some((s) => /discard/i.test(s))).toBe(false)
  })
})
