# R2 build fixes (QA B-D)

## Decisions
- **Tests out of the build tsc.** `web/tsconfig.build.json` extends `tsconfig.json` and excludes `*.test.ts(x)`, `*.spec.*`, `src/test`, `__tests__`. `pnpm build` uses it (`tsc --noEmit -p tsconfig.build.json && vite build`); `pnpm typecheck` and `scripts/check.sh` still type-check tests with `tsconfig.json`. Testdata is not copied into the image.
- **BuildKit required.** Dropping `--platform=$BUILDPLATFORM` would force emulated cross-arch builds in the release workflow. BuildKit is the default since Docker 23. `make docker` runs `DOCKER_BUILDKIT=1 docker build -t feeder:dev .`; documented in docs/dev/deploy.md.
- **`-buildvcs=false`** on every `go build` (Makefile, Dockerfile). In a linked worktree `.git` is a file pointing outside the tree, so Go's VCS stamping fails ("error obtaining VCS status"). The binary does not use build info for versioning, the image has no `.git`, so stamping is useless; the flag also makes builds identical everywhere.

## Tests
`scripts/test/build_test.sh` (run by check.sh): config excludes tests, tsc `--listFilesOnly` lists no test file (when node_modules exist), flags in Makefile/Dockerfile, `make docker` uses BuildKit, deploy.md mentions it, and a real `go build -buildvcs=false ./cmd/feeder` from the current tree. `make build` itself is not run (pnpm install + vite build exceeds 60 s).

## Manual gate (Developer and Reviewer)
check.sh does not run docker. Each must run once and record the result in their report:
`DOCKER_BUILDKIT=1 docker build -t feeder:dev .` (or `make docker`). Docker Hub pulls are approved. Also run `make build` in the linked worktree.
