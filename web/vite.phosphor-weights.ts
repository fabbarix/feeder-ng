// Build-time slimming of @phosphor-icons/react (docs/dev/design/uf1-icons.md). Every icon's defs module holds a Map of
// six weights; the app only ever draws regular, bold, fill and duotone (the `IconWeight` type of ui/Icon.tsx), so
// `thin` and `light` are dropped from the modules before bundling. Also used by vitest so tests see the same modules.
import type { Plugin } from 'vite'

export const KEPT_WEIGHTS = ['regular', 'bold', 'fill', 'duotone'] as const

const DEFS = /@phosphor-icons[\\/]react[\\/]dist[\\/]defs[\\/][A-Za-z0-9]+\.(?:es|esm)?\.?js(?:\?.*)?$/

type Node = { type: string; start: number; end: number; elements?: (Node | null)[]; value?: unknown }

function isPair(n: Node | null): n is Node {
  const first = n?.elements?.[0]
  return n?.type === 'ArrayExpression' && n.elements?.length === 2 && first?.type === 'Literal' && typeof first.value === 'string'
}

function walk(n: unknown, visit: (n: Node) => void): void {
  if (!n || typeof n !== 'object') return
  if (Array.isArray(n)) return n.forEach((c) => walk(c, visit))
  const node = n as Record<string, unknown>
  if (typeof node.type === 'string') visit(node as unknown as Node)
  for (const k of Object.keys(node)) if (k !== 'type') walk(node[k], visit)
}

export function phosphorWeights(): Plugin {
  return {
    name: 'feeder:phosphor-weights',
    enforce: 'pre',
    transform(code, id) {
      if (!DEFS.test(id)) return null
      const fail = (why: string): never =>
        this.error(`feeder:phosphor-weights: unexpected layout in ${id} (${why}); @phosphor-icons/react changed, update web/vite.phosphor-weights.ts`)
      const ast = this.parse(code) as unknown
      let outer: Node | undefined
      walk(ast, (n) => {
        if (!outer && n.type === 'ArrayExpression' && n.elements?.length && n.elements.every(isPair)) outer = n
      })
      if (!outer?.elements) return fail('no array of [weight, element] pairs')
      const kept: string[] = []
      const seen = new Set<string>()
      for (const pair of outer.elements as Node[]) {
        const name = (pair.elements![0] as Node).value as string
        seen.add(name)
        if ((KEPT_WEIGHTS as readonly string[]).includes(name)) kept.push(code.slice(pair.start, pair.end))
      }
      for (const w of KEPT_WEIGHTS) if (!seen.has(w)) return fail(`weight ${w} missing`)
      return { code: code.slice(0, outer.start) + '[' + kept.join(',') + ']' + code.slice(outer.end), map: null }
    },
  }
}
