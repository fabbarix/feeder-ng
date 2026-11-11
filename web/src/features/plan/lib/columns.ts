/**
 * R2-2 (L-05): columns by the width of the grid's own container, not the viewport (the side rail and the page gutters
 * eat 100 to 330 px). 7 from 1100 px of container (the week fits one row from a 1440 px viewport beside the rail), 4 from 560 px, else 2.
 */
export function planColumnsForContainer(containerWidth: number): 2 | 4 | 7 {
  if (containerWidth >= 1100) return 7
  if (containerWidth >= 560) return 4
  return 2
}
