/** Plan grid columns by viewport width: phone 2, tablet 4 (from 768 px), desktop 7 (from 1200 px), a true week. */
export function planColumns(width: number): 2 | 4 | 7 {
  if (width >= 1200) return 7
  if (width >= 768) return 4
  return 2
}

/**
 * R2-2 (L-05): columns by the width of the grid's own container, not the viewport (the side rail and the page gutters
 * eat 100 to 330 px). 7 from 1200 px of container, 4 from 560 px, else 2. STUB: the Developer implements it.
 */
export function planColumnsForContainer(containerWidth: number): 2 | 4 | 7 {
  return planColumns(containerWidth)
}
