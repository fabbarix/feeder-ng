# D1: deploy (GitHub Actions, GHCR, Helm chart)

Scope: publish the image and a Helm chart, both **public** on GHCR (anonymous pulls), and document installing them. No application code changes.

Names: image `ghcr.io/fabbarix/feeder-ng`; chart is the OCI artifact `oci://ghcr.io/fabbarix/charts/feeder` (`helm push` to `oci://ghcr.io/fabbarix/charts`, which stores `charts/feeder`).

## Workflows (finish T15's, do not duplicate)

- `ci.yml` (token: `contents: read` only, never `packages: write`): job `check` runs `scripts/check.sh` on `pull_request` and `push` to `main`. New job `image-build` (PRs only, `needs: check`): `docker/build-push-action` with `push: false`, `linux/amd64`, GHA cache read-write; proves the Dockerfile builds without publishing and without secrets (fork PRs work).
- `release.yml` (renamed "Publish" in its `name`, file name kept): triggers `push` to `main` and tags `v*`. Jobs:
  - `check`: as today (the gate). On `main` this repeats the CI run; accepted for simplicity.
  - `image` (`needs: check`, `permissions: contents: read, packages: write`): qemu, buildx, `docker/login-action` (`ghcr.io`, `github.actor`, `secrets.GITHUB_TOKEN`), `docker/metadata-action`, `docker/build-push-action` with `push: true`, `platforms: linux/amd64,linux/arm64`, `cache-from/to type=gha`. Tags: `main` and `sha-<short>` on main pushes; semver `{{version}}`, `{{major}}.{{minor}}`, `{{major}}` (not for 0.x) and `latest` on `v*` tags only (not for prereleases). Labels come from metadata-action and include `org.opencontainers.image.source` (set explicitly too, to `https://github.com/${{ github.repository }}`).
  - `chart` (`needs: image`, only `if: startsWith(github.ref, 'refs/tags/v')`, `packages: write`): uses the `helm` preinstalled on `ubuntu-latest` (no unpinned third-party action), `helm registry login ghcr.io` with the token on stdin, `helm package deploy/helm/feeder --version X --app-version X` with `X` the tag without the leading `v`, then `helm push` to `oci://ghcr.io/<owner lowercased>/charts`.
- All actions pinned to a full SHA with `# vX.Y.Z`.

## Chart `deploy/helm/feeder`

Files: `Chart.yaml` (apiVersion v2, `version: 0.0.0`, `appVersion: latest` in the repo; CI overrides both), `values.yaml`, `values.schema.json`, `README.md`, `.helmignore`, `templates/{_helpers.tpl,deployment.yaml,service.yaml,ingress.yaml,pvc.yaml,secret.yaml,serviceaccount.yaml,NOTES.txt}`.

Release name `feeder` renders resources named `feeder` (fullname helper: release name when it already contains the chart name).

### Values contract (what helm_test.sh relies on)

| Key | Default | Notes |
|---|---|---|
| `image.repository` / `tag` / `pullPolicy` | `ghcr.io/fabbarix/feeder-ng` / `""` (= `.Chart.AppVersion`) / `IfNotPresent` | |
| `imagePullSecrets` | `[]` | public images need none |
| `adminEmail` | `""` | **required** (template `required`) -> `FEEDER_ADMIN_EMAIL` |
| `baseUrl` | `""` | **required** -> `FEEDER_BASE_URL` |
| `google.clientId`, `google.clientSecret` | `""` | when either is set and `existingSecret` is empty, the chart creates Secret `<fullname>-google` |
| `google.existingSecret` | `""` | name of a Secret; no Secret is created |
| `google.clientIdKey`, `google.clientSecretKey` | `client-id`, `client-secret` | keys inside the Secret (existing or created) |
| `env` | `{}` | map of extra plain env (e.g. `FEEDER_ADDR`); `FEEDER_DEV_LOGIN` is never set by default |
| `extraEnv` | `[]` | raw container env entries (may use `valueFrom`) |
| `service.type` / `port` | `ClusterIP` / `80` | targets container port `http` 8080 |
| `ingress.enabled` | `false` | |
| `ingress.className` | `""` | |
| `ingress.annotations` | ingress-nginx SSE defaults: `nginx.ingress.kubernetes.io/proxy-buffering: "off"`, `proxy-read-timeout: "3600"`, `proxy-send-timeout: "3600"`, `proxy-body-size: 10m` | maps merge, so users override single keys |
| `ingress.host` | `""` | falls back to the host of `baseUrl` |
| `ingress.tls.enabled` / `secretName` | `false` / `""` | `secretName` empty = no `secretName` key (cert-manager or default cert) |
| `persistence.enabled` | `true` | `false` = `emptyDir` (data lost on restart; for trials only) |
| `persistence.existingClaim` | `""` | no PVC created when set |
| `persistence.storageClass`, `size`, `accessModes`, `annotations` | unset, `1Gi`, `[ReadWriteOnce]`, `{}` | `storageClass: "-"` renders `""` |
| `podSecurityContext` | `runAsNonRoot: true, runAsUser/runAsGroup/fsGroup: 65532, fsGroupChangePolicy: OnRootMismatch` | |
| `securityContext` | `readOnlyRootFilesystem: true, allowPrivilegeEscalation: false, capabilities.drop: [ALL]` | |
| `resources`, `nodeSelector`, `tolerations`, `affinity`, `podAnnotations`, `podLabels` | `{}`/`[]` (modest requests) | |
| `serviceAccount.create` / `name` / `annotations` / `automount` | `true` / `""` / `{}` / `false` | |
| `probes.*` | startup/liveness/readiness, all `GET /api/health` on port `http` | |

There is **no** `replicaCount` value: the Deployment is always `replicas: 1` with `strategy.type: Recreate`, because SQLite on one RWO volume cannot be shared. `values.schema.json` forbids a `replicaCount` key (additionalProperties false at top level) and checks types and required fields.

### Read-only root

The code writes only under `FEEDER_DATA_DIR` (`/data`: database, WAL, `images/` temp files created in the store dir, `backups/`, `vapid.json`). Go's `os.TempDir` is not used outside tests. The chart still mounts an `emptyDir` on `/tmp` as cheap insurance for library temp files, so `readOnlyRootFilesystem: true` is safe.

### Secrets

`FEEDER_GOOGLE_CLIENT_ID/SECRET` use `secretKeyRef`, never literal values in the Deployment. With neither `existingSecret` nor inline values, no Google env is rendered (sign-in disabled).

## Verification

`scripts/test/helm_test.sh` (skips with a message when `helm` or `python3 -c 'import yaml'` is missing): lint and template for defaults, ingress+TLS, `google.existingSecret`, inline Google values, `existingClaim`, and negative cases (no adminEmail, schema violation, `replicaCount`). `scripts/test/workflows_test.sh` is extended for the new workflow expectations. kind/kubectl are not available, so no install test runs here.

## Review fixes (tests first; the developer applies the docs and chart changes)

- `FEEDER_ADDR` is fixed at `:8080` under the chart (container port, Service and probes are hardcoded). It must not be offered as an example extra `env` in `values.yaml`, the chart README or this note; the README states it must stay `:8080`. The extra-env test uses `TZ`.
- Every `helm upgrade` in `docs/dev/deploy.md` and the chart README carries `--namespace feeder`; any upgrade with `--set` or `--version` also carries `--reuse-values` (same form as `templates/NOTES.txt`).
- Docs state `/data` must be writable by uid/gid 65532, that an `existingClaim` whose volume ignores `fsGroup` (hostPath, NFS, some CSI) must be `chown 65532:65532` beforehand, and never claim `fsGroup` alone makes it writable.
- `deploy/helm/feeder/ci/lint-values.yaml` (new) makes `helm lint ... -f` pass; the schema allows the Helm-reserved `global` key; setting only one of `google.clientId` / `google.clientSecret` fails rendering.
- Workflow: the chart job `needs: image`; `VERSION="${TAG#v}"` from `github.ref_name` feeds both `--version` and `--app-version`; `--password-stdin` is used.
- Docs: making a package public cannot be undone; no first-person hedging in `deploy.md`; the README says no `latest` image exists until the first stable `v*` tag (use `image.tag=main` before then).
- `helm_test.sh` cross-checks that `GET /api/health` is registered in `internal/`.

## Decisions

- `release.yml` keeps its name; "Publish" is its display name.
- No `azure/setup-helm`: the runner's helm is used (no new action to pin).
- Packages are private on first push; making them public is a one-time manual step (see `docs/dev/deploy.md`).
