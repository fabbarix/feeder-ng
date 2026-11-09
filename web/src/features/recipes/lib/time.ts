/** "40 min", "1 h 5 min", "2 h", "1 d". Whole minutes in; used for total time and Advance Step lead times. */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.ceil(minutes))
  if (m < 60) return `${m} min`
  if (m % 1440 === 0 && m >= 1440) return `${m / 1440} d`
  const hours = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
