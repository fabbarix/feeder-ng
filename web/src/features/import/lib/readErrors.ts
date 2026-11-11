// Read error code -> copy (docs/dev/design/ra-e-import.md section 4.3; plan section 1.4). Plain TypeScript, no React.
import type { PathError } from '../types'

/** A failed read, a refused start (ApiError) or a local problem, reduced to what the copy needs. */
export interface ReadErrorInput {
  code: string
  message?: string
  retryAfterSeconds?: number
  errors?: PathError[]
  model?: string
}
/** retry: "Try again"; settings: link to /settings/recipe-assistant; chooseModel: link to /settings/recipe-assistant#model; none. */
export type ReadErrorAction = 'retry' | 'settings' | 'chooseModel' | 'none'
export interface ReadErrorCopy {
  message: string
  /** A second line: what to do (Admins) or "Ask an Admin." (Users). */
  hint?: string
  action: ReadErrorAction
  /** True when sending the same input again can work. */
  retryable: boolean
  /** "path: message" lines of assistant_invalid_output, at most 5. */
  details: string[]
}

export function readErrorCopy(error: ReadErrorInput, o: { isAdmin: boolean }): ReadErrorCopy {
  void error
  void o
  throw new Error('TODO(ra-e developer): not implemented')
}
/** 30 -> "30 s", 59 -> "59 s", 60 -> "1 min", 61 -> "2 min" (rounded up). */
export function waitText(seconds: number): string {
  void seconds
  throw new Error('TODO(ra-e developer): not implemented')
}
/** The ApiError of a refused start or a failed poll -> ReadErrorInput (details.retryAfterSeconds / errors / model; status 0 -> 'network' or 'timeout'). */
export function errorFromApi(err: unknown): ReadErrorInput {
  void err
  throw new Error('TODO(ra-e developer): not implemented')
}
