/** The Feeder mark above the sign-in title: a plate with a fork, drawn in the current colour (tokens, no literals). */
export function FeederMark() {
  return (
    <svg className="signin__mark" role="img" aria-label="Feeder" viewBox="0 0 48 48" width="48" height="48">
      <circle cx="24" cy="26" r="16" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M16 6v10M12 6v10M20 6v10M16 16c0 2 2 3 2 3v0M16 19v11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M34 6c-3 3-3 9 0 11v9h2V6h-2z" fill="currentColor" />
    </svg>
  )
}
