# R2 build fixes (QA B-D)

## Decisions
- **Tests out of the build tsc.** `web/tsconfig.build.json` extends `tsconfig.json` and excludes `*.test.ts(x)`, `*.spec.*`, `src/test`, `__tests__`. `pnpm build` uses it (`tsc --noEmit -p tsconfig.build.json && vite build`); `pnpm typecheck` and `scripts/check.sh` still type-check tests with `tsconfig.json`. Testdata is not copied into the image.
- **Works with both builders.** The stages use `FROM --platform=$BUILDPLATFORM` so cross-arch release builds do not run under emulation. A global `ARG BUILDPLATFORM=linux/amd64` default before the first `FROM` lets the legacy builder parse the file; BuildKit overrides it with the real build platform. Multi-arch images need buildx (Ubuntu/Debian: the `docker-buildx` package). `make docker` uses buildx when `docker buildx version` succeeds and plain `docker build` otherwise; documented in docs/dev/deploy.md.
- **`-buildvcs=false`** on every `go build` (Makefile, Dockerfile). In a linked worktree `.git` is a file pointing outside the tree, so Go's VCS stamping fails ("error obtaining VCS status"). The binary does not use build info for versioning, the image has no `.git`, so stamping is useless; the flag also makes builds identical everywhere.

## Tests
`scripts/test/build_test.sh` (run by check.sh): config excludes tests, tsc `--listFilesOnly` lists no test file (when node_modules exist), flags in Makefile/Dockerfile, a global `ARG BUILDPLATFORM=` default precedes the first `FROM --platform=$BUILDPLATFORM`, the `make docker` target falls back when buildx is missing, deploy.md mentions buildx, and a real `go build -buildvcs=false ./cmd/feeder` from the current tree. `make build` itself is not run (pnpm install + vite build exceeds 60 s).

## Manual gate (Developer and Reviewer)
check.sh does not run docker. Each must run once and record the result in their report:
`make docker` (buildx when available, plain `docker build` otherwise). Docker Hub pulls are approved. Also run `make build` in the linked worktree.
