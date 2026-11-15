/**
 * B9-47 (TB-04): where Close kitchen board and Esc go. React Router gives the first entry of a session the key "default", so
 * a board opened directly (a wall tablet's start page) goes to Today ('/'); a board the app navigated to goes back one entry (-1).
 */
export function leaveTarget(locationKey: string): -1 | '/' {
  return locationKey === 'default' ? '/' : -1
}
