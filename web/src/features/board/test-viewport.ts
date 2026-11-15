// B9-47: a matchMedia that answers for a viewport, whatever form the board's queries take (em or px, min/max, orientation).
export interface Viewport { width: number; height: number }
function length(text: string): number {
  const m = /^([\d.]+)(em|rem|px)$/.exec(text.trim())
  return m ? Number(m[1]) * (m[2] === 'px' ? 1 : 16) : Number.NaN
}
function matches(query: string, vp: Viewport): boolean {
  return query.split(/\band\b/).every((raw) => {
    const part = raw.replace(/[()]/g, '').trim()
    let m = /^(min|max)-(width|height):\s*(.+)$/.exec(part)
    if (m) {
      const size = m[2] === 'width' ? vp.width : vp.height
      return m[1] === 'min' ? size >= length(m[3]!) : size <= length(m[3]!)
    }
    m = /^width\s*(<|<=|>|>=)\s*(.+)$/.exec(part)
    if (m) return { '<': vp.width < length(m[2]!), '<=': vp.width <= length(m[2]!), '>': vp.width > length(m[2]!), '>=': vp.width >= length(m[2]!) }[m[1]!]!
    m = /^orientation:\s*(portrait|landscape)$/.exec(part)
    if (m) return (vp.height >= vp.width ? 'portrait' : 'landscape') === m[1]
    return false // prefers-reduced-motion, pointer, anything else
  })
}
export const originalMatchMedia = globalThis.matchMedia
export function viewport(width: number, height: number) {
  globalThis.matchMedia = ((query: string) => ({ matches: matches(query, { width, height }), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof globalThis.matchMedia
}

