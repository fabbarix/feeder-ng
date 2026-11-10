# The Recipe Assistant calls Anthropic from the server, with an encrypted Admin-held key, and only feeds Import Review

Status: **Proposed** (2026-11-10). Design: [docs/dev/design/ai-recipe-import.md](../dev/design/ai-recipe-import.md).

Feeder gains an optional **Recipe Assistant**: a User pastes a web page address or recipe text, and a Claude model (Anthropic API) turns it into a Recipe File. It is off by default and is the first time Feeder sends household data to a third-party service, so these choices are recorded together:

1. **Server-side only.** The browser never calls Anthropic and never sees the API key. The Go server fetches the page (through the same SSRF guard as Recipe File images), extracts the text and any schema.org Recipe data, calls the Messages API with the official Go SDK (`github.com/anthropics/anthropic-sdk-go`) and structured JSON output, and validates the result.
2. **The model's only product is a Recipe File, which goes through Import Review.** The model has no tools; its output is constrained to a projection of `recipe-file-v1.schema.json`, then re-validated against the full schema and the Recipe rules on the server. Nothing is saved without a User confirming Import Review. Fetched and pasted content is untrusted data in the prompt, so a prompt injection can at worst change the proposed Recipe, which the User sees before saving.
3. **One household-wide configuration, Admin-only** (spec §2: the Admin manages household settings): enable, API base URL, model and API key. The key is write-only through the API (the API reports only whether one is saved and its last four characters). Saving with an empty key keeps the saved one; an explicit Remove clears it.
4. **The key is encrypted at rest** with AES-256-GCM under a master key that is never in the database: `FEEDER_SECRET_KEY` when the operator sets it, otherwise a random key file `/data/secret.key` (0600) created on first use. Database files and nightly backups therefore hold only ciphertext.

**Considered options**
- *Browser calls the API directly with a per-User key*: no key storage on the server, but every User needs an Anthropic account, the key sits in the browser, and the page fetch hits CORS. Rejected.
- *Plain `net/http` instead of the SDK*: one less dependency, but we would re-implement typed errors, retry with `retry-after`, base URL handling and the Models API paging. The SDK is the documented default for Go. Accepted cost: a new module in `go.mod`.
- *Model output saved directly as Recipes*: faster, but it would bypass the Ingredient matching, unit check and human check that keep the catalogue clean, and it would let injected content write data. Rejected.
- *Key stored in plaintext in SQLite*: simplest, but any copy of `feeder.db` or a backup leaks a billable credential. Rejected.
- *Master key only from an environment variable (mandatory)*: strongest separation, but a new mandatory setting for every self-hoster for an optional feature. Kept as the preferred option, with the key file as the default.

**Consequences**
- With the default key file, someone who can read the whole `/data` volume can decrypt the key; only copies of the database and backups are protected. Operators who want more set `FEEDER_SECRET_KEY` (e.g. from a Kubernetes Secret).
- Restoring a backup onto a new volume without the old master key leaves the API key unreadable; the Admin enters it again (the UI says so).
- ADR 0002 keeps its meaning: no external product database is queried. The Recipe Assistant is opt-in, used only on an explicit User action, and never in the shop.
