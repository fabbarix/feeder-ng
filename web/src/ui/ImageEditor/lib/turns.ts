/** Quarter-turn maths of the image editor (pure; docs/dev/design/photo-read.md, section 3.2). */
export type Turns = 0 | 1 | 2 | 3

/** (current + delta) modulo 4. */
export function addTurn(current: Turns, delta: 1 | -1): Turns {
  return ((current + delta + 4) % 4) as Turns
}

/** The size after `turns` quarter turns: odd turns swap width and height. */
export function turnedSize(width: number, height: number, turns: Turns): { width: number; height: number } {
  return turns % 2 === 1 ? { width: height, height: width } : { width, height }
}
