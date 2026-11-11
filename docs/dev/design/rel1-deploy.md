# REL-1: release and deploy preparation for v1.0.0-beta.1

Status: design and red tests (pipeline step 1). Implementation is the Developer's. Related: [d1-deploy.md](d1-deploy.md), [ai-recipe-import.md](ai-recipe-import.md) §4.1.1 (the `FEEDER_SECRET_KEY` chart design, which this note refines), [ai-recipe-import-docs-draft.md](ai-recipe-import-docs-draft.md) §4.

Release: git tag `v1.0.0-beta.1`, pushed by the user. Nothing here publishes anything.

## 1. Environment variable inventory

`internal/config/config.go` reads exactly these through the injected `getenv` (`os.Getenv` in `cmd/feeder/main.go`); nothing else in `internal/` or `cmd/` reads the environment.

| Variable | Chart today | Chart after REL-1 |
|---|---|---|
| `FEEDER_ADMIN_EMAIL` | `adminEmail` | unchanged |
| `FEEDER_BASE_URL` | `baseUrl` | unchanged |
| `FEEDER_GOOGLE_CLIENT_ID` / `_SECRET` | `google.*` via Secret | unchanged (README must now name the env vars) |
| `FEEDER_TRUST_PROXY` | `trustProxy` (done) | unchanged |
| `FEEDER_SECRET_KEY` | **missing** | `secretKey.*`, from a Secret only (§2) |
| `FEEDER_ADDR` | not set, README says it must stay `:8080` | allowlisted: port, Service and probes are hardcoded, the image sets the same default |
| `FEEDER_DATA_DIR` | not set | allowlisted: the volume mount is hardcoded to `/data`, the image sets the same default |
| `FEEDER_DEV_LOGIN` | not set, README forbids it | allowlisted: must never reach a cluster |

So the only new setting this round is `FEEDER_SECRET_KEY`. The ingress `proxy-body-size` annotation also changes from `10m` to `50m` (photo reads send up to 45 MiB; ingress-nginx defaults to 1 MB). `deploy.md` also needs the `client_max_body_size 50m` line for the Caddy/nginx examples.

## 2. Chart: `FEEDER_SECRET_KEY`

Values (no inline-value field; `values.schema.json` adds the `secretKey` object with `additionalProperties: false`):

```yaml
secretKey:
  generate: true          # chart creates <fullname>-secret-key on install and keeps it
  existingSecret: ""      # wins over generate
  key: secret-key         # key inside the Secret (existing or generated)
```

- `templates/secret-key.yaml`, rendered when `generate` and no `existingSecret`. Name `<fullname>-secret-key`, annotation `helm.sh/resource-policy: keep`. **Sprig `randBytes 32` already returns base64** (44 characters, decodes to 32 bytes): do not pipe it through `b64enc` (that gives 64 characters and the app would refuse to start; verified by running `helm template`). Use `stringData` for a fresh value. When `lookup "v1" "Secret" .Release.Namespace $name` finds the Secret, re-emit its `data.<key>` unchanged (already base64, so use `data:`, not `stringData:`).
- Deployment: `FEEDER_SECRET_KEY` from `secretKeyRef` (name = `existingSecret` or `<fullname>-secret-key`, key = `secretKey.key`) when either source is active; nothing when `generate: false` and no `existingSecret`.
- The key is never a plain value: no inline field; the schema rejects `secretKey.value`; the chart `fail`s when `env.FEEDER_SECRET_KEY` is set, or an `extraEnv` entry named `FEEDER_SECRET_KEY` has a `value` (a `valueFrom` entry is allowed: that is the escape hatch for an external secret store). NOTES never prints it.
- **Nil-safety for `--reuse-values`.** The existing docs upgrade with `--reuse-values`, which reuses the previous release's computed values. A release from 1.0.0-dev has no `secretKey` there, so `.Values.secretKey.generate` is a nil-pointer error. All access goes through a helper in `_helpers.tpl` that starts from `.Values.secretKey | default dict` (a test greps that no other template touches `.Values.secretKey`). With old values the helper sees "no generate, no existingSecret", so such an upgrade silently has no key. The upgrade note therefore says: when upgrading from 1.0.0-dev use `--reset-then-reuse-values` (Helm 3.14+), which re-applies the new chart defaults, or pass `--set secretKey.generate=true`. `upgrade_check` in helm_test.sh accepts `--reset-then-reuse-values` as well as `--reuse-values`.
- NOTES.txt says which source is in use (generated / existing / none), whether the Recipe Assistant can be turned on, and repeats the Argo/`helm template` caveat for the generated Secret.
- Docs (chart README, deploy.md): both routes, `openssl rand -base64 32`, the caveats (`lookup` returns nothing under `helm template`, `--dry-run`, Argo CD, Flux offline renders: a fresh key on every render, so set `existingSecret`), losing the key means an Admin re-enters the API key, rotation = replace the Secret value, `kubectl -n feeder rollout restart deploy/feeder`, re-enter the API key; no `_PREVIOUS` variable; keep the key out of backups.

## 3. What can and cannot be verified offline

No cluster, so `lookup` is untestable. The tests cover:

| Case | How | Offline? |
|---|---|---|
| generate on install | default render: one Secret, 44 chars of base64 decoding to 32 bytes, keep annotation, `secretKeyRef` | yes |
| key not leaked | key appears only in the Secret manifest, not the Deployment or NOTES | yes |
| two renders differ | pins the documented GitOps caveat (lookup finds nothing offline) | yes |
| persistence on upgrade, keep on uninstall, reinstall reuse | template source must call `lookup "v1" "Secret" .Release.Namespace`, `randBytes 32`, carry the keep annotation and have a reuse branch (static greps) | **partly**: real behaviour needs a cluster (kind/k3d) |
| existingSecret precedence, `key`, `generate: false`, schema, env smuggling | renders and negative renders | yes |
| `--reuse-values` from 1.0.0-dev | static grep for nil-safety | **partly** |
| chart packaging of the prerelease | `helm package --version 1.0.0-beta.1 --app-version 1.0.0-beta.1` yields `feeder-1.0.0-beta.1.tgz` | yes |
| OCI push, anonymous pull, GHCR visibility, the Publish run itself | | **no** (GitHub); verify per deploy.md after the tag push |
| metadata-action's actual tag output | the workflow is asserted textually and the version mapping is simulated | **no** |

A manual cluster checklist for the user goes in `deploy.md`'s release section: install, read the Secret, `helm upgrade` with an unrelated change, `helm uninstall`, reinstall, compare.

## 4. Release workflow and prerelease scheme

`release.yml` already derives `VERSION="${TAG#v}"` for chart `--version`/`--app-version`, tags the image with `{{version}}`, and sets `latest` only when `ref_name` has no `-`. Findings for `v1.0.0-beta.1`: image `1.0.0-beta.1` and chart `1.0.0-beta.1` are correct, no `latest`. One gap: the `{{major}}.{{minor}}` and `{{major}}` rules are not guarded, so they rely on metadata-action skipping prereleases. Red test: add `&& !contains(github.ref_name, '-')` to both, so `1.0` and `1` can never point at a prerelease whatever the action does.

`deploy.md` documents: `-beta.N` then `-rc.N` then stable, ordering `1.0.0-dev < 1.0.0-beta.1 < 1.0.0-rc.1 < 1.0.0` (semver compares `beta` < `rc` alphabetically and numeric parts numerically), prereleases get no `latest`, `1.0` or `1` tag, `helm` needs an explicit `--version` (or `--devel`) for a prerelease chart, the image table row for `1.0.0-beta.1`, `git tag v1.0.0-beta.1 && git push origin v1.0.0-beta.1`, and an upgrade note from `1.0.0-dev` (first upgrade creates the key Secret; `--reset-then-reuse-values`; SQLite migrations run on start, so take a backup first as in the Backups section; downgrade is not supported).

`Chart.yaml`: `version: 1.0.0-beta.1`, `appVersion: 1.0.0-beta.1`. The existing default-image test follows `appVersion` automatically. The chart README and `deploy.md` install examples use `--version 1.0.0-beta.1`.

## 5. THIRD_PARTY_NOTICES.md

Root file, one table per ecosystem so the test and humans can read it: `## Go modules` and `## npm packages (shipped in the web bundle)`, rows `| module | version | SPDX licence | notes |`. Every `go.mod` require (direct, indirect, including test-only ones such as godog/gherkin: they sit in `go.mod`, so they are listed under a "build and test only" subheading) and every `web/package.json` `dependencies` entry. Dev dependencies (build tooling) are not shipped and are not listed. Copied into the image (`COPY THIRD_PARTY_NOTICES.md /THIRD_PARTY_NOTICES.md`; the Dockerfile is a Developer change) and linked from `deploy.md`.

Licences read from the module cache (checked offline; the npm packages have no `node_modules` or lockfile licence data here, so the Developer reads them after `pnpm install`):

| Module | Licence |
|---|---|
| anthropic-sdk-go, tidwall/gjson, sjson, match, pretty, buger/jsonparser, invopop/jsonschema, standard-webhooks/libraries | MIT |
| pb33f/ordered-map/v2, santhosh-tekuri/jsonschema/v6, cloud.google.com/go/compute/metadata | Apache-2.0 |
| bahlo/generic-list-go, google/uuid, golang.org/x/{sync,net,image,oauth2,crypto,sys,text}, spf13/pflag, remyoudompheng/bigfft, modernc.org/{mathutil,memory,libc,sqlite} | BSD-3-Clause (modernc.org/sqlite also bundles SQLite, public domain, and `LICENSE-3RD-PARTY.md`) |
| go.yaml.in/yaml/v4 | MIT and Apache-2.0, plus its `NOTICE` text, reproduced in full |
| HugoSmits86/nativewebp, SherClockHolmes/webpush-go, cucumber/{godog,gherkin,messages}, mattn/go-isatty (MIT/Expat), ncruces/go-strftime | MIT |
| hashicorp/{go-immutable-radix,go-memdb,golang-lru} | MPL-2.0 (file-level copyleft: unmodified, link to the source) |
| dustin/go-humanize, golang-jwt/jwt/v5 | MIT (confirm in the cache: no licence name in the header line) |

Anything the Developer cannot confirm from the licence file is marked in the file, not guessed.

## 6. CHANGELOG.md

Keep a Changelog layout, user-facing, in GLOSSARY terms (the test checks no `_Avoid_` word). Sections: `Unreleased`, `[1.0.0-beta.1] - <tag date>`, `[1.0.0-dev]` (baseline, one line). Source: `git log v1.0.0-dev..main --merges` (the tag exists locally; 72 merge commits, about half are `Merge branch 'main'` noise). Feature merges to cover: Access Requests (a1), Recipe editor and inline Ingredient creation (r14, r14b), Couldn't plan (r13), Reheat for Leftover meals (r12), zero-waste streak (r11c), Settings shell and plan/cook layout polish (r11a, r11b), Meal Slots multi-day edit (r15), field/layout work (r2f, r2l, u1), ImagePicker and image fields (ip1, im2), icons budget (uf1), the Recipe Assistant (ra-ab, ra-c, ra-d, ra-e), and deploy/release-tag changes (d2). Plus an upgrade note: new `FEEDER_SECRET_KEY`/`secretKey.*`, ingress body size 50m, `--reset-then-reuse-values`, THIRD_PARTY_NOTICES. Written by the Developer from the merge subjects and the specs, not from commit bodies guessed at.

## 7. Env-drift guard

`scripts/test/env_drift_test.sh` (runs in `check.sh` with the other shell tests). It extracts names with a regex over non-test `internal/config/*.go` (`os.Getenv`/`os.LookupEnv`/`getenv(`/`lookup(`), asserts the parser finds the nine known names (so a broken parser can't pass vacuously), fails if anything outside `internal/config` reads the environment, and for each name requires: a `name: X` env entry in the chart templates (or an allowlist entry with a reason; a stale allowlist entry also fails), a mention in the chart README, and a `deploy.md` env-table row. The three secrets must use `valueFrom`.

## 8. Test inventory

All new tests are in existing runners (`scripts/check.sh` runs every `scripts/test/*_test.sh`):

- `helm_test.sh`: chart version/appVersion `1.0.0-beta.1`; prerelease packaging; `proxy-body-size` 50m; secret-key cases (generate, 32 bytes, keep, leak, lookup source, existingSecret, `key`, `generate: false`, naming, schema, env smuggling, nil-safety); chart README and NOTES; deploy.md secret key text. Two existing assertions changed meaning because a Secret now always exists: "no Secret" became "no Google Secret".
- `workflows_test.sh`: prerelease tag rules and version mapping.
- `env_drift_test.sh`, `notices_test.sh`, `release_test.sh` (CHANGELOG, deploy.md scheme and upgrade note).

Expected red before implementation: the new assertions only; everything that passed on `main` still passes.
