// B9-53 (TB-06): the Meal Slots page's "?add=1&weekdays=1,2,3" (from the first-run quick start's "Set up by hand"): open the Add editor on
// those weekdays. Every weekday when the list is missing or holds none that is valid.
const ALL = [1, 2, 3, 4, 5, 6, 7]

export function addFromQuery(search: URLSearchParams): { weekdays: number[] } | null {
  if (search.get('add') !== '1') return null
  const days = (search.get('weekdays') ?? '')
    .split(',')
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  const unique = [...new Set(days)].sort((a, b) => a - b)
  return { weekdays: unique.length > 0 ? unique : [...ALL] }
}
