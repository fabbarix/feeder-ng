// The page-layout seed, access area (B9-52, SET-12): pending sign-in requests for /settings/access-requests. The seed talks to the
// server over HTTP, and an Access Request is only made by a Google sign-in, which the guard cannot do; so this step writes the rows
// through the store's own table (internal/access/store: access_requests), in the scratch database the guard started the server on.
// The requests are what the review needs: a long name with a long address (the title that must stay readable at 375), a request with
// no name from Google, one that expires in two days (the state's warn tone), a fresh one and an old one.
// The data dir is, in order: ctx.dataDir, PAGE_LAYOUT_DATA_DIR, or `page-layout-data` beside the ids file (--out), which is where
// scripts/check-page-layout.sh puts it. Best effort like the other areas: a database that cannot be opened is reported and skipped
// (the page then shows no requests, which the access-requests scenario reports instead of passing quietly).
import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'

export const order = 500

const DAY = 86_400_000

/** The requests, as offsets from now: [email, name, picture, asked N ms ago, expires in N ms]. */
export const REQUESTS = [
  ['zia.rosa@example.test', 'Zia Rosa', '', 2 * DAY, 12 * DAY],
  ['chiara.rossi-verdi@famiglia-rossi-verdi.example.test', 'Chiara Rossi-Verdi di San Giovanni Valdarno', '', 5 * DAY, 9 * DAY],
  ['no.name@example.test', '', '', 3_600_000, 14 * DAY - 3_600_000],
  ['expiring.soon@example.test', 'Expiring Soon', '', 12 * DAY, 2 * DAY - 60_000],
  ['rex@example.test', 'Rex', '', 60_000, 14 * DAY - 60_000],
]

export function dataDirOf(ctx, argv = process.argv, env = process.env) {
  if (ctx.dataDir) return ctx.dataDir
  if (env.PAGE_LAYOUT_DATA_DIR) return env.PAGE_LAYOUT_DATA_DIR
  const i = argv.indexOf('--out')
  return resolve(dirname(i >= 0 && argv[i + 1] ? argv[i + 1] : 'build/page-layout-ids.json'), 'page-layout-data')
}

export async function seed(ctx) {
  const dir = dataDirOf(ctx)
  let db
  try {
    db = new DatabaseSync(`${dir}/feeder.db`)
    db.exec('PRAGMA busy_timeout = 5000')
    const now = Date.now()
    const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
    const insert = db.prepare('INSERT OR IGNORE INTO access_requests (email, name, picture, token_hash, requested_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    let n = 0
    for (const [email, name, picture, askedAgo, expiresIn] of REQUESTS) {
      insert.run(email, name, picture, `page-layout-${email}`, iso(now - askedAgo), iso(now - askedAgo), iso(now + expiresIn))
      n++
    }
    ctx.accessRequests = n
  } catch (e) {
    console.error(`page-layout-seed: access requests were not written (${dir}/feeder.db: ${e?.message ?? e}); /settings/access-requests will be empty`)
    ctx.accessRequests = 0
  } finally {
    db?.close()
  }
}
