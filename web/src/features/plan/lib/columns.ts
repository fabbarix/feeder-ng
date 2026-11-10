/** Plan grid columns by viewport width: phone 2, tablet 4 (from 768 px), desktop 7 (from 1200 px), a true week. */
export function planColumns(width: number): 2 | 4 | 7 {
  if (width >= 1200) return 7
  if (width >= 768) return 4
  return 2
}
