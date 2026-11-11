// "Read a recipe": the input -> the POST /api/recipe-assistant/reads body, with the checks the server also makes
// (docs/dev/design/ra-e-import.md section 4.1). Plain TypeScript, no React.
import type { ReadBody, ReadInput } from '../types'

export const READ_LIMITS = { textChars: 50_000, photos: 4, photoBytes: 8 * 1024 * 1024 } as const

/** The server's validation codes, found before sending anything. */
export type InputProblem = 'url_invalid' | 'text_empty' | 'text_too_long' | 'photos_empty' | 'too_many_photos' | 'photo_too_large' | 'photo_unsupported'
export type BuiltRead = { ok: true; body: ReadBody } | { ok: false; problem: InputProblem; /** 0-based photo the problem is about. */ index?: number }

/** TODO(ra-e developer): see ra-e-import.md section 4.1 and readRequest.test.ts. */
export function buildReadRequest(input: ReadInput): BuiltRead {
  void input
  throw new Error('TODO(ra-e developer): not implemented')
}

/** "1,234 / 50,000" for the text counter; `over` when the trimmed text has more than 50,000 characters. */
export function textCounter(text: string): { label: string; over: boolean } {
  void text
  throw new Error('TODO(ra-e developer): not implemented')
}
