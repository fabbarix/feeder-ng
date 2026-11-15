// SHORT-01: the words of the Advance Steps chip in short landscape. Plain TypeScript, no React.

/** "1 Advance Step to do" / "2 Advance Steps to do"; '' when none is left (the chip is absent). */
export function advanceChipLabel(count: number): string {
  if (!(count > 0)) return ''
  return count === 1 ? '1 Advance Step to do' : `${count} Advance Steps to do`
}

/** The chip's accessible name, always: "Advance Steps: 1 to do"; '' when none is left. */
export function advanceChipName(count: number): string {
  if (!(count > 0)) return ''
  return `Advance Steps: ${count} to do`
}
