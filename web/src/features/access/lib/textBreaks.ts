// Pure helpers for where a person's address or name may wrap. Plain TypeScript, no React.

/** An address in the pieces it may wrap between: before the "@" and after each ".". The pieces join back to the address. */
export function emailBreak(email: string): string[] {
  if (!email) return []
  return email.split(/(?=@)|(?<=\.)/).filter((p) => p !== '')
}

/** A name in the pieces it may wrap between: its spaces only (a hyphenated part, "Rossi-Verdi", stays whole). The pieces,
 *  spaces included, join back to the name. */
export function nameBreak(name: string): string[] {
  if (!name) return []
  return name.split(/(\s+)/).filter((p) => p !== '')
}
