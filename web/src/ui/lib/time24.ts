/** "HH:mm" (24 h, zero padded) for a Date's local clock time. */
export function clockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
