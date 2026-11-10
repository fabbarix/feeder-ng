# D2: publish tagged versions only

Scope: change the Publish workflow so images and charts exist only for released versions, and correct the docs about package visibility. No application code changes. Builds on [d1-deploy.md](d1-deploy.md).

## Decisions

1. **`release.yml` triggers on `tags: ["v*"]` only.** The `push: branches: [main]` trigger is removed. The image tag rules `type=raw,value=main` and `type=sha,prefix=sha-` are removed: they only made sense for main pushes.
2. **No `sha-<short>` tag on tag builds either.** A semver tag already names one exact commit, and the image carries the OCI revision label from metadata-action. A second moving name adds nothing. Remaining rules: `{{version}}`, `{{major}}.{{minor}}`, `{{major}}` (not for 0.x) and `latest` (stable tags only, no `-` in the tag), each enabled only for `refs/tags/v*`.
3. **No `workflow_dispatch`.** A failed release is re-run with "Re-run jobs" on the tag's run, which keeps the tag ref. A manual trigger would need a ref guard in every job for no gain. `schedule` and `workflow_run` are likewise absent.
4. **`ci.yml` is unchanged**: checks on `pull_request` and on `push` to `main`, the PR-only `image-build` with `push: false`, no registry login, no `packages: write`.
5. **Before the first stable tag**, install a pre-release semver tag (`v1.0.0-dev`, image `1.0.0-dev`, chart `1.0.0-dev`) instead of `main`. Pre-release tags never get `latest`.
6. **Package visibility.** Verified on GHCR: both `v1.0.0-dev` packages pulled anonymously, so packages inherit public visibility from a public repository. `deploy.md` says the make-public step is usually unnecessary, tells the reader to verify an anonymous pull after the first push, and keeps the UI steps as a fallback for a 401/denied pull (including the note that going public cannot be undone).

## Docs to change (by the developer)

- `release.yml` header comment: tags only; `latest` from stable tags only.
- `docs/dev/deploy.md`: tag table without `main` and `sha-<short>`; Workflows bullets; "To release" with `git tag v1.0.0 && git push origin v1.0.0`, plus the pre-release advice; rename the one-time section to verification with fallback.
- `deploy/helm/feeder/README.md`: replace `--set image.tag=main` with a pre-release tag such as `v1.0.0-dev`; d1-deploy.md is historical and left as is.

## Tests (red until implemented)

`scripts/test/workflows_test.sh`: the d1 assertions that required main triggers and `main`/`sha-` tags are removed; added: no `branches:` or `refs/heads/` in `release.yml`, no `type=ref`, `value=main`, `type=sha`, no `workflow_dispatch`/`schedule`/`workflow_run`, header says tags only, every `type=` rule is enabled for `refs/tags/v` only; `ci.yml` keeps `pull_request` and `push`, never `push: true`, never mentions a registry or chart publish.

`scripts/test/helm_test.sh`: docs, workflows and README carry no `:main`/`image.tag=main`/`sha-<short>` reference; README and deploy.md name `v1.0.0-dev`; deploy.md shows the tag-push release, says tags only, `latest` only from stable tags, make-public usually unnecessary, packages inherit visibility, verify anonymous pull, 401/denied fallback, and no longer claims packages are always private.
