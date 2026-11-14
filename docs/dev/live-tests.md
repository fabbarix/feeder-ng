# Live tests (opt-in, billed)

A few Go tests call the real Anthropic API. They are never part of `scripts/check.sh` or CI: each one skips unless it is
switched on and given a key.

## The key: one rule

The tests read the key through `internal/testkit/anthropickey` (`anthropickey.Lookup()`), never with `os.Getenv`. It takes
the first non-empty value, trimmed, of:

1. `FEEDER_ANTHROPIC_KEY`: the name to use in a shell, a CI secret or a script;
2. `FEEDER_LIVE_ANTHROPIC_KEY`: the old name of the Recipe Assistant's live test, kept as an alias;
3. `ANTHROPIC_KEY`: the name the repo's `.env.local` defines, so the file works as it is.

A skipped test says which names it looks for, never a value. The key is handed only to the Claude adapter; no test prints,
logs or returns it, and `scripts/test/live-key-env_test.sh` fails when one formats it into output or reads the variables
on its own.

## Running them

`.env.local` is not exported by itself. Load it, then switch the live tests on:

```sh
set -a; . ./.env.local; set +a
FEEDER_LIVE_SCHEMA_CHECK=1 go test ./internal/receipt/service/ ./internal/recipeassistant/claude/ ./internal/recipeassistant/service/ -run Live -v
```

- `FEEDER_LIVE_SCHEMA_CHECK=1` switches on the schema checks and the receipt read (`TestLiveReceiptReadCompletes`,
  `TestLiveOutputSchemaCompiles`, `TestLiveReceiptReadsAFixture`).
- The Recipe Assistant's smoke test (`TestLiveReadStreamsARecipe`) needs only a key; `FEEDER_LIVE_ANTHROPIC_BASE_URL` and
  `FEEDER_LIVE_ANTHROPIC_MODEL` are optional.
- Print nothing from the file: do not `cat` or `env` it in a shared log.
