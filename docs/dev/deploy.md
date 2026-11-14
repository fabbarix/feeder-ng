# Deploying the Feeder

The Feeder is one container: a static Go binary with the web app embedded, and all state on one `/data` volume ([ADR 0004](../adr/0004-go-binary-sqlite-on-data-volume.md)). It speaks plain HTTP on port 8080 and expects an HTTPS reverse proxy in front: camera scanning, Web Push and Google sign-in all require HTTPS.

## Image

The image is published on GHCR and pulls anonymously once its package is public (no `docker login`):

```sh
docker pull ghcr.io/fabbarix/feeder-ng:1.0.0
```

Third-party licences: the image carries [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) at `/THIRD_PARTY_NOTICES.md`.

| Tag | Published on | Meaning |
|---|---|---|
| `1.0.0-beta.1` | tag `v1.0.0-beta.1` | prerelease: the first beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.2` | tag `v1.0.0-beta.2` | prerelease: the second beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.3` | tag `v1.0.0-beta.3` | prerelease: the third beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.4` | tag `v1.0.0-beta.4` | prerelease: the fourth beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.4.1` | tag `v1.0.0-beta.4.1` | prerelease: the first fix release of the fourth beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.4.2` | tag `v1.0.0-beta.4.2` | prerelease: the second fix release of the fourth beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.5` | tag `v1.0.0-beta.5` | prerelease: the fifth beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.5.1` | tag `v1.0.0-beta.5.1` | prerelease: the first fix release of the fifth beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.6` | tag `v1.0.0-beta.6` | prerelease: the sixth beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.6.1` | tag `v1.0.0-beta.6.1` | prerelease: the first fix release of the sixth beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.6.2` | tag `v1.0.0-beta.6.2` | prerelease: the second fix release of the sixth beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.6.3` | tag `v1.0.0-beta.6.3` | prerelease: the third fix release of the sixth beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.6.4` | tag `v1.0.0-beta.6.4` | prerelease: the fourth fix release of the sixth beta; never `latest`, `1.0` or `1` |
| `1.0.0-beta.6.5` | tag `v1.0.0-beta.6.5` | prerelease: the fifth fix release of the sixth beta; never `latest`, `1.0` or `1` |
| `1.0.0-dev` | tag `v1.0.0-dev` | earlier prerelease; never `latest` |
| `1.0.0`, `1.0`, `1` | tag `v1.0.0` | exact version, latest patch of 1.0, latest 1.x (no `1` tag for 0.x) |
| `latest` | a `v*` tag without a `-` prerelease suffix | latest stable release; does not exist until the first stable tag |

Nothing is published from branches, and there is no moving branch tag. A semver tag already names one exact commit, and the image carries the commit in its OCI revision label.

All tags are multi-arch (`linux/amd64`, `linux/arm64`) and carry the OCI label `org.opencontainers.image.source`, which links the package to this repository.

Workflows:

- `.github/workflows/ci.yml`: runs on pull requests only; a push to `main` runs nothing, and checks run on `v*` tags through `release.yml`. It runs the same two parallel check jobs as `release.yml` (below), then builds the image without pushing it (and without any registry login), so a broken Dockerfile fails the PR. It never publishes.
- `.github/workflows/release.yml` ("Publish"): runs only on `v*` tags. It runs the checks as two parallel jobs, then, once both pass, builds and pushes the image with the `GITHUB_TOKEN` (`packages: write`, nothing else). It then packages the Helm chart with `--version` and `--app-version` taken from the tag (`v1.2.3` becomes `1.2.3`) and pushes it to `oci://ghcr.io/fabbarix/charts`. A failed release is re-run with *Re-run jobs* on the tag's run, which keeps the tag.

Both workflows run `scripts/check.sh` with `CHECK_PROFILE=ci`, a fast safety net, split into two jobs that run side by side:

- **web** (`CHECK_ONLY=web`): the UI guards, `pnpm install`, typecheck, vitest and the vite build;
- **Go and shell tests** (`CHECK_ONLY=go`): `pnpm install` (some shell tests run vite), `go vet`, `go test` and the shell tests that do not start a browser.

The ci profile leaves out the headless-Chrome work, the slowest part of the check: the page layout guard (`scripts/check-page-layout.sh`) and the shell tests marked `# check-profile: browser` (the ones that start Chrome; `scripts/test/workflows_test.sh` fails when a test that starts Chrome is not marked, or the reverse). So **run the full check locally before every tag**: `bash scripts/check.sh` with no `CHECK_PROFILE` is the full check and runs every step. `CHECK_LIST=1 bash scripts/check.sh` prints the steps and shell tests a run would take, without running them (add `CHECK_PROFILE=ci` to see the CI list).

Images and the chart are published from `v*` tags only. `latest` is set only on stable tags (no `-` in the tag).

To release: `git tag v1.0.0 && git push origin v1.0.0`.

### Prereleases

Before the first stable tag, release prereleases: `-beta.N` first, then `-rc.N`, then the stable tag. They order as `1.0.0-dev < 1.0.0-beta.1 < 1.0.0-rc.1 < 1.0.0` (semver compares the identifiers alphabetically, `beta` before `rc`, and the numbers numerically; so `beta.2` comes before `beta.10`). A fix release of a beta adds a number: 1.0.0-beta.4 < 1.0.0-beta.4.1 < 1.0.0-beta.5 (more identifiers sort after the same prefix). To release the first beta:

```sh
git tag v1.0.0-beta.1 && git push origin v1.0.0-beta.1
```

This publishes image `1.0.0-beta.1` and chart `1.0.0-beta.1`. A prerelease never gets the `latest`, `1.0` or `1` image tags: `release.yml` guards the `{{major}}.{{minor}}`, `{{major}}` and `latest` rules with `!contains(github.ref_name, '-')`, so those tags only ever name stable releases. Helm hides prerelease charts unless you ask for them, so a prerelease install needs an explicit `--version 1.0.0-beta.1` (or `--devel`, which picks the newest prerelease).

Checklist after the beta tag, on a real cluster (not testable offline): install the chart, read the Secret `feeder-secret-key`, upgrade with an unrelated change and confirm the key is unchanged, `helm uninstall`, reinstall and confirm the same key (the Secret has `helm.sh/resource-policy: keep`).

### Verify anonymous pull after the first push

Packages inherit visibility from the repository, and this repository is public, so the packages are usually public from their first push. The make-public step is usually unnecessary. After the first tag push (for example `v1.0.0-beta.1`), check from a machine with no `docker login` or `helm registry login`:

```sh
docker pull ghcr.io/fabbarix/feeder-ng:1.0.0-beta.1
helm pull oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.1
```

If either pull fails with 401 or "denied", the package is still private. Make it public by hand, once, in the web UI:

1. Open `https://github.com/fabbarix?tab=packages` (or the repository's *Packages* sidebar), then each package: `feeder-ng` (the image) and `charts/feeder` (the chart).
2. *Package settings* -> *Danger Zone* -> *Change visibility* -> **Public**. Making a package public cannot be undone: a public package cannot be made private again, so do this once the image and chart are ready to be public.
3. Still in *Package settings*, check *Connect repository* / "Linked repository" shows `fabbarix/feeder-ng`. The image links itself through the `org.opencontainers.image.source` label; the chart package usually has to be linked by hand (*Connect repository*). Linking also lets the workflow's `GITHUB_TOKEN` keep pushing new versions.
4. If a push is denied with 403 later, in *Package settings* -> *Manage Actions access* add the repository with the *Write* role.

These steps are done in the web UI. The GitHub REST API lists, reads and deletes packages and versions (for example `GET /user/packages/container/feeder-ng`), but it does not change a package's visibility or link a package to a repository. Any token used for package API calls needs the classic PAT scopes `write:packages` and `read:packages`. Never put such a PAT in the workflows; the workflows use `GITHUB_TOKEN` only.

## Building the image locally

```sh
make docker        # buildx when available, plain docker build otherwise
```

The Dockerfile works with both the legacy builder and BuildKit: its stages use `FROM --platform=$BUILDPLATFORM` so the Go binary cross-compiles natively for each target architecture instead of running under emulation, and a global `ARG BUILDPLATFORM=linux/amd64` default before the first `FROM` keeps the legacy builder happy (BuildKit overrides it with the real build platform). Multi-arch images need **buildx** (on Ubuntu/Debian, the `docker-buildx` package). `make docker` uses buildx when `docker buildx version` succeeds and plain `docker build` otherwise. The web stage builds with `web/tsconfig.build.json`, which excludes test files (they are still type-checked by `scripts/check.sh`); the Go build uses `-buildvcs=false`, because the image has no `.git` and the binary does not need VCS stamping.

## Environment

| Variable | Required | Meaning |
|---|---|---|
| `FEEDER_ADMIN_EMAIL` | yes | Email of the first Admin. The process exits with a clear message without it. It seeds the allowlist; the Admin adds everyone else in Settings. |
| `FEEDER_BASE_URL` | yes in production | The public https URL, e.g. `https://feeder.example.com` (no trailing slash). Used for the Google redirect URI and the cross-origin check. |
| `FEEDER_GOOGLE_CLIENT_ID` | for Google sign-in | OAuth client id. |
| `FEEDER_GOOGLE_CLIENT_SECRET` | for Google sign-in | OAuth client secret. Keep it in a secret file or secret store, not in the compose file. |
| `FEEDER_SECRET_KEY` | for the Recipe Assistant | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts the stored API key. Without it the Recipe Assistant stays off. Keep it in a secret file or secret store. Losing or changing it means an Admin re-enters the API key (see Secret key). |
| `FEEDER_DATA_DIR` | no | Default `/data` (the volume). |
| `FEEDER_ADDR` | no | Default `:8080`. |
| `FEEDER_TRUST_PROXY` | no | Default `false`. `true` takes the client address (for the sign-in request rate limits) from the last `X-Forwarded-For` entry. Set it only when the Feeder sits behind a reverse proxy that appends the real client address. With it off, the socket peer address is used: behind a proxy every visitor then shares the proxy's address and one rate limit bucket. With it on and no proxy, anyone could forge the header. |
| `FEEDER_DEV_LOGIN` | never in production | `1` enables a passwordless dev login. Leave unset. |

The Google variables are `FEEDER_GOOGLE_CLIENT_ID` and `FEEDER_GOOGLE_CLIENT_SECRET`; the chart reads them from a Secret (`google.existingSecret`).

Google setup: `scripts/setup-google-auth.sh` (see [t6-google-auth-script.md](design/t6-google-auth-script.md)) creates the OAuth client; the authorised redirect URI is `$FEEDER_BASE_URL/auth/google/callback`. Web Push needs no Google or GCP setup: the Feeder creates its own VAPID keys on first start in `/data/vapid.json`. Do not delete that file, or every device has to turn notifications on again.

### Secret key

`FEEDER_SECRET_KEY` is 32 random bytes in base64 (44 characters). Create one with `openssl rand -base64 32` and pass it as an environment variable (docker, compose) or a Secret (Kubernetes). The Helm chart can generate it: by default (`secretKey.generate: true`) it creates Secret `<fullname>-secret-key` with `randBytes 32`, which already returns base64. The chart looks the Secret up on every upgrade (`lookup`) and re-emits the existing value, and the Secret carries `helm.sh/resource-policy: keep`, so uninstalling and reinstalling keeps the same key. `secretKey.existingSecret` (with `secretKey.key`) takes precedence and creates nothing. With `secretKey.generate: false` and no `existingSecret` there is no key and the Recipe Assistant stays off. The chart refuses `env.FEEDER_SECRET_KEY` and a plain-value `extraEnv` entry; a `valueFrom` entry works for an external secret store.

Caveats for Argo CD, Flux offline renders and `helm template` (also client `--dry-run`): `lookup` returns nothing there, so each render makes a new key and the Secret would change on every sync. In those setups set `secretKey.existingSecret` to a Secret you manage.

Losing the key, or replacing it, means the stored API key cannot be read: an Admin enters the API key again in Settings. There is no previous-key variable. To rotate: replace the Secret's value, run `kubectl -n feeder rollout restart deploy/feeder`, then re-enter the API key. Keep the key out of backups of the data volume (it protects what is in them).

## docker run

```sh
docker run -d --name feeder --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v feeder-data:/data \
  -e FEEDER_ADMIN_EMAIL=you@example.com \
  -e FEEDER_BASE_URL=https://feeder.example.com \
  -e FEEDER_GOOGLE_CLIENT_ID=... \
  -e FEEDER_GOOGLE_CLIENT_SECRET=... \
  -e FEEDER_SECRET_KEY="$(cat /etc/feeder/secret-key)" \
  -e FEEDER_TRUST_PROXY=true \
  ghcr.io/fabbarix/feeder-ng:1
```

The image runs as user `nonroot` (uid/gid 65532). A named volume works as is; a bind mount (`-v /srv/feeder:/data`) must be writable by uid 65532 or the container cannot create its database: `sudo chown 65532:65532 /srv/feeder`. (The Helm chart sets `fsGroup: 65532`; see the Kubernetes section for volumes that ignore it.)

## docker compose

```yaml
services:
  feeder:
    image: ghcr.io/fabbarix/feeder-ng:1
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"     # only the reverse proxy reaches it
    volumes:
      - feeder-data:/data
    environment:
      FEEDER_ADMIN_EMAIL: you@example.com
      FEEDER_BASE_URL: https://feeder.example.com
      FEEDER_GOOGLE_CLIENT_ID: ${FEEDER_GOOGLE_CLIENT_ID}
      FEEDER_GOOGLE_CLIENT_SECRET: ${FEEDER_GOOGLE_CLIENT_SECRET}   # from an .env file kept out of git
      FEEDER_SECRET_KEY: ${FEEDER_SECRET_KEY}   # openssl rand -base64 32; from the same .env file
      FEEDER_TRUST_PROXY: "true"      # only because a reverse proxy sits in front; omit when users connect directly
volumes:
  feeder-data:
```

The image is distroless (no shell), so there is no `HEALTHCHECK`; let the proxy probe `GET /` instead.

## Kubernetes (Helm)

The chart is public too, published as an OCI artifact; installing it needs no login:

```sh
helm install feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.6.5 \
  --namespace feeder --create-namespace \
  --set adminEmail=you@example.com \
  --set baseUrl=https://feeder.example.com \
  --set ingress.enabled=true --set ingress.className=nginx \
  --set ingress.tls.enabled=true --set ingress.tls.secretName=feeder-tls
```

The chart version equals the release (`v1.0.0-beta.6.5` publishes chart `1.0.0-beta.6.5` with `appVersion` `1.0.0-beta.6.5`), and the image tag defaults to `appVersion`. Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version X --namespace feeder --reset-then-reuse-values` (Helm 3.14 or newer). Plain `--reuse-values` reuses the old computed values, so a new chart's `secretKey` default (and any other new setting) is not applied; `--reset-then-reuse-values` re-applies the new defaults and then your overrides, or add `--set secretKey.generate=true`. Source and the values table: `deploy/helm/feeder/README.md`.

- **One replica only.** The state is a SQLite file on a single volume, so the Deployment is fixed at one replica with the `Recreate` strategy (no overlap during upgrades) and must never be scaled.
- **Storage.** A PVC mounted at `/data` (`persistence.size`, `persistence.storageClass`, or `persistence.existingClaim`). `/data` must be writable by uid/gid 65532. The pod sets `fsGroup: 65532`, which makes most dynamically provisioned volumes writable, but `fsGroup` is not enough on its own: an `existingClaim` whose volume ignores `fsGroup` (hostPath, NFS, some CSI drivers) must be chowned beforehand with `chown 65532:65532` on the volume's directory. The root filesystem is read-only; only `/data` and an `emptyDir` `/tmp` are writable.
- **Google sign-in.** Create the OAuth client with `scripts/setup-google-auth.sh` (it prints the redirect URI `$baseUrl/auth/google/callback` and saves the client id and secret to `.env.local`). Put them in a Secret and reference it, so the secret never sits in values or shell history:

  ```sh
  kubectl -n feeder create secret generic feeder-google \
    --from-literal=client-id=... --from-literal=client-secret=...
  helm upgrade --install feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.6.5 --namespace feeder --reset-then-reuse-values \
    --set google.existingSecret=feeder-google
  ```

  Keys default to `client-id` and `client-secret` (`google.clientIdKey`, `google.clientSecretKey`). For a quick trial you can instead pass `google.clientId` and `google.clientSecret`, and the chart creates the Secret.
- **Secret key.** The chart generates `FEEDER_SECRET_KEY` by default; see Secret key above for `secretKey.existingSecret`, the Argo CD and `helm template` caveat, and rotation.
- **Ingress.** The default annotations target ingress-nginx and make `/api/events` (server-sent events) work: `proxy-buffering: "off"`, one-hour `proxy-read-timeout` and `proxy-send-timeout`, `proxy-body-size: 50m` (photo reads send up to 45 MiB; ingress-nginx allows 1 MB by default). Override single keys under `ingress.annotations` for other controllers.
- **Trust proxy.** `trustProxy: null` (the default) is automatic: the chart sets `FEEDER_TRUST_PROXY` to `true` when `ingress.enabled` is true and to `false` otherwise. Set `trustProxy: true` or `false` to override, for example `true` when your own proxy in front of the Service appends the real client address. With it off, the socket peer address is used, so behind a proxy all visitors share one rate limit bucket.
- **Probes.** All three probes call `GET /api/health`.
- **Backups** still land in `/data/backups` on the PVC; copy them off the cluster as described below.

## Reverse proxy

Terminate TLS in front and forward to `127.0.0.1:8080`. Caddy:

```
feeder.example.com {
    request_body {
        max_size 50MB
    }
    reverse_proxy 127.0.0.1:8080
}
```

nginx needs `client_max_body_size 50m;` in the `server` or `location` block (the default is 1 MB).

Traefik, nginx and others work the same way. Requirements:

- Forward the `Host` header unchanged and keep `FEEDER_BASE_URL` equal to the public URL: state-changing requests are rejected with 403 `cross_origin` when the `Origin` header does not match it.
- Do not buffer or time out the `/api/events` stream (server-sent events): disable response buffering for that path (`flush_interval -1` in Caddy, `proxy_buffering off` in nginx) and allow idle connections of several minutes.
- Set `FEEDER_TRUST_PROXY=true` only when the proxy appends the real client address as the last `X-Forwarded-For` entry (Caddy, nginx and Traefik do by default). Left off, the socket peer address is used and every visitor shares the proxy's rate limit bucket.
- Proxy body size: a photo read (Recipe Assistant) sends up to 45 MiB, so allow request bodies of at least 50 MB (`client_max_body_size 50m` in nginx, `request_body { max_size 50MB }` in Caddy, `proxy-body-size: 50m` on ingress-nginx). Other uploads are small.

## Backups

The Feeder writes a consistent SQLite snapshot (`VACUUM INTO`) to `/data/backups/feeder-YYYY-MM-DD.db` every night at 02:30 household time, and keeps the newest 7 daily snapshots plus the newest snapshot of each of the 4 most recent older weeks (about 11 files). An Admin can also take one at any time (`POST /api/admin/backups`) and list them (`GET /api/admin/backups`), for example before an upgrade.

Do not store `FEEDER_SECRET_KEY` next to the snapshots: with the key, a snapshot can be read. Restoring a snapshot with a different key only means an Admin re-enters the API key.

Snapshots live on the same volume as the database, so copy them elsewhere to survive a lost disk. `/data/images` is not in the snapshots; back that folder up as well:

```sh
rsync -a /var/lib/docker/volumes/feeder-data/_data/backups/ nas:/backups/feeder/
rsync -a /var/lib/docker/volumes/feeder-data/_data/images/  nas:/backups/feeder-images/
```

### Restore

```sh
docker stop feeder
cp /path/to/feeder-2026-11-09.db /srv/feeder/feeder.db     # into the data dir
rm -f /srv/feeder/feeder.db-wal /srv/feeder/feeder.db-shm  # stale write-ahead files
chown 65532:65532 /srv/feeder/feeder.db
docker start feeder
```

Migrations run at start-up, so restoring an older snapshot into a newer image upgrades it.

## Upgrading

```sh
docker pull ghcr.io/fabbarix/feeder-ng:1 && docker compose up -d
```

Take a backup first (Admin: `POST /api/admin/backups`). Migrations are forward-only; to go back, restore the snapshot and run the older image.

### Upgrading from 1.0.0-dev to 1.0.0-beta.1

1. Take a backup first (Admin: `POST /api/admin/backups`, or copy `/data/backups` and `/data/images`). Migrations run at start and are forward-only; downgrading is not supported, to go back restore the snapshot and run the older image.
2. Kubernetes: `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.1 --namespace feeder --reset-then-reuse-values`. Use `--reset-then-reuse-values` (not plain `--reuse-values`, which keeps the 1.0.0-dev values and so no `secretKey`). The first upgrade creates the Secret `feeder-secret-key`. Under Argo CD or `helm template`, set `secretKey.existingSecret` first.
3. docker / compose: set `FEEDER_SECRET_KEY` (`openssl rand -base64 32`) if you want the Recipe Assistant, then pull and restart.
4. Ingress users: the default `proxy-body-size` is now `50m`; custom reverse proxies need the same limit (see Reverse proxy).
5. Admin: open the Recipe Assistant settings and enter the API key.

### Upgrading from 1.0.0-beta.3 to 1.0.0-beta.4

This release adds Courses, which changes how a Planned Meal is stored, so read this before you upgrade.

1. Take a backup first (Admin: `POST /api/admin/backups`, or copy `/data/backups` and `/data/images`). Migrations run at start and are forward-only.
2. Upgrade. Kubernetes: `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.4 --namespace feeder --reset-then-reuse-values`. Docker or compose: pull the new image and restart. There are no new settings.
3. Four migrations run on the first start:
   - `1400` adds Courses (seeded Main, Side, Starter and Dessert) and keys every Planned Meal, Leftover and Slot Rule to a Course; the existing ones become the main Course.
   - `1410` rewrites the Advance Step reminders already sent so they are not sent again.
   - `1430` adds the column that records which Exclusions ruled a Course out of the Plan.
   - `1440` adds Tags as entities with colours. Existing Tags get the ten Tag colours in name order, and a Tag that only a Slot Rule or Variety Rule named gets a Tag of its own. Nothing is lost, and no snapshot is taken for it.
4. **The pre-1400 snapshot.** If the database already has Planned Meals, Feeder first takes a verified snapshot as `feeder-pre-1400.db` in `/data/backups` (on Docker, the `backups` folder of the data volume; on Kubernetes, the `backups` folder of the PVC). It is written before any migration runs, with `integrity_check`. If it cannot be written, Feeder stops with a log line naming `feeder-pre-1400.db` and nothing is migrated. A fresh install, and a database that already has 1400, take none. The file is not listed in Settings, is never pruned by the nightly clean-up and stays until you delete it. It is the database as it was before the upgrade, so copy it off the volume if you want to keep it. The nightly snapshots (`feeder-YYYY-MM-DD.db`) are separate.
5. **Rolling back.** Migrations cannot be undone, so going back to 1.0.0-beta.3 means restoring the snapshot and running the older image:

```sh
docker stop feeder                                          # Kubernetes: kubectl -n feeder scale deploy/feeder --replicas=0
cp /srv/feeder/backups/feeder-pre-1400.db /srv/feeder/feeder.db
rm -f /srv/feeder/feeder.db-wal /srv/feeder/feeder.db-shm   # stale write-ahead files
chown 65532:65532 /srv/feeder/feeder.db
# run the older image: ghcr.io/fabbarix/feeder-ng:1.0.0-beta.3
```

   On Kubernetes the paths above are on the PVC, which you reach by mounting it in a helper pod while the deployment is scaled to zero (for example a pod with the PVC mounted at `/data` and an image that has `cp`, `rm` and `chown`). In the pod the files are under `/data/...`: the snapshot is `/data/backups/feeder-pre-1400.db` and the database is `/data/feeder.db`, owned by 65532. Run the same `cp`, `rm` and `chown` there with those paths, then delete the helper pod. To bring the replica back on the older release, run `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.3 --namespace feeder --reset-then-reuse-values`, or roll back the release: `helm history feeder -n feeder` lists the revisions, and `helm rollback feeder <revision> -n feeder` goes back to the last one that ran 1.0.0-beta.3 (the one before the upgrade, which is not always the highest number below the current one if you changed values in between).

   Everything Feeder recorded after the upgrade (Plan changes, Stock, new Recipes) is gone with the restore; images in `/data/images` stay. Restore the file as `feeder.db` owned by uid/gid 65532, as in Restore above. Do not start the new image on the restored file: it migrates it again.

### Upgrading from 1.0.0-beta.4.2 to 1.0.0-beta.5

This release adds Meal Slot dates and Guests, Leftovers by hand, Bought Planned Meals and Not needed on the Shopping List, so read this before you upgrade.

1. Take a backup first (Admin: `POST /api/admin/backups`, or copy `/data/backups` and `/data/images`). Migrations run at start and are forward-only.
2. Upgrade. Kubernetes: `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.5.1 --namespace feeder --reset-then-reuse-values`. Docker or compose: pull the new image and restart. There are no new settings.
3. Four migrations run on the first start:
   - `1500` adds the table behind a Meal Slot on one date: Not served, the date's own time and Guests.
   - `1510` lets a Leftover sit in a Storage Place and be frozen, and adds the Frozen Use-by (90 days for the Household, optional per Recipe) and the history of the hand actions Had it, Threw it out, Freeze it, Take out and Wasn't there.
   - `1520` adds the record of which Planned Meal a purchase from the Shopping List was bought for. Purchases made before the upgrade have no record, so no Planned Meal is Bought until the next purchase.
   - `1530` adds Not needed for the Shopping List.
4. **The pre-1500 snapshot.** If the database already has applied migrations, Feeder first takes a verified snapshot as `feeder-pre-1500.db` in `/data/backups` (on Docker, the `backups` folder of the data volume; on Kubernetes, the `backups` folder of the PVC), before any of the four migrations runs, with `integrity_check`. If it cannot be written, Feeder stops with a log line naming `feeder-pre-1500.db` and nothing is migrated. A fresh install takes none. An existing `feeder-pre-1500.db` is never replaced, so a start that stopped half way (1500 applied, 1510 failed) keeps the true pre-upgrade file. The file is not listed in Settings, is never pruned by the nightly clean-up and stays until you delete it, so copy it off the volume if you want to keep it. A database that also lacks migration 1400 (an upgrade from before beta.4) gets `feeder-pre-1400.db` as well. A database that skips this release and goes straight to 1.0.0-beta.6 gets `feeder-pre-1500.db` and `feeder-pre-1540.db`, both the database as it was before any migration. The nightly snapshots (`feeder-YYYY-MM-DD.db`) are separate.
5. A Leftover past its Use-by is no longer thrown away at 03:00. After the upgrade those Leftovers wait on Today until a User answers Had it, Threw it out or Wasn't there.
6. **Rolling back.** Migrations cannot be undone, so going back to 1.0.0-beta.4.2 means restoring the snapshot and running the older image. A `helm rollback` on its own does not restore the database:

```sh
docker stop feeder                                          # Kubernetes: kubectl -n feeder scale deploy/feeder --replicas=0
cp /srv/feeder/backups/feeder-pre-1500.db /srv/feeder/feeder.db
rm -f /srv/feeder/feeder.db-wal /srv/feeder/feeder.db-shm   # stale write-ahead files
chown 65532:65532 /srv/feeder/feeder.db
# run the older image: ghcr.io/fabbarix/feeder-ng:1.0.0-beta.4.2
```

   On Kubernetes the paths above are on the PVC, which you reach by mounting it in a helper pod while the deployment is scaled to zero (for example a pod with the PVC mounted at `/data` and an image that has `cp`, `rm` and `chown`). In the pod the snapshot is `/data/backups/feeder-pre-1500.db` and the database is `/data/feeder.db`, owned by 65532. Run the same `cp`, `rm` and `chown` there with those paths, then delete the helper pod. Then bring the replica back on the older release: `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.4.2 --namespace feeder --reset-then-reuse-values`, or roll back the release: `helm history feeder -n feeder` lists the revisions, and `helm rollback feeder <revision> -n feeder` goes back to the last one that ran 1.0.0-beta.4.2 (the one before the upgrade, which is not always the highest number below the current one if you changed values in between). `helm rollback` scales the deployment back up, so restore the database first.

   Everything Feeder recorded after the upgrade (Plan changes, Stock, new Recipes, Leftovers answered by hand) is gone with the restore; images in `/data/images` stay. Restore the file as `feeder.db` owned by uid/gid 65532, as in Restore above. Do not start the new image on the restored file: it migrates it again.

### Upgrading from 1.0.0-beta.5.x to 1.0.0-beta.6

This release adds Base recipes (a béchamel, a pasta frolla or a stock that other Recipes call for), so read this before you upgrade.

1. Take a backup first (Admin: `POST /api/admin/backups`, or copy `/data/backups` and `/data/images`). Migrations run at start and are forward-only.
2. Upgrade. Kubernetes: `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.6.5 --namespace feeder --reset-then-reuse-values`. Docker or compose: pull the new image and restart. There are no new settings.
3. One migration runs on the first start: `1540` adds the columns behind Base recipes (a Recipe's Base recipe Ingredient and Yield unit, a line's Needed at Step and the Ingredient a linked line had before). It only adds columns: every existing Recipe stays a plannable Recipe, and no line changes until a User links it.
4. **The pre-1540 snapshot.** If the database already has applied migrations, Feeder first takes a verified snapshot as `feeder-pre-1540.db` in `/data/backups` (on Docker, the `backups` folder of the data volume; on Kubernetes, the `backups` folder of the PVC), before migration 1540 runs, with `integrity_check`. If it cannot be written, Feeder stops with a log line naming `feeder-pre-1540.db` and nothing is migrated. A fresh install takes none. An existing `feeder-pre-1540.db` is never replaced, so a start that failed after the snapshot keeps the true pre-upgrade file. The file is not listed in Settings, is never pruned by the nightly clean-up and stays until you delete it, so copy it off the volume if you want to keep it. The nightly snapshots (`feeder-YYYY-MM-DD.db`) are separate.
5. **Rolling back.** Migrations cannot be undone, so going back to 1.0.0-beta.5.1 means restoring the snapshot and running the older image. A `helm rollback` on its own does not restore the database:

```sh
docker stop feeder                                          # Kubernetes: kubectl -n feeder scale deploy/feeder --replicas=0
cp /srv/feeder/backups/feeder-pre-1540.db /srv/feeder/feeder.db
rm -f /srv/feeder/feeder.db-wal /srv/feeder/feeder.db-shm   # stale write-ahead files
chown 65532:65532 /srv/feeder/feeder.db
# run the older image: ghcr.io/fabbarix/feeder-ng:1.0.0-beta.5.1
```

   On Kubernetes the paths above are on the PVC, which you reach by mounting it in a helper pod while the deployment is scaled to zero (for example a pod with the PVC mounted at `/data` and an image that has `cp`, `rm` and `chown`). In the pod the snapshot is `/data/backups/feeder-pre-1540.db` and the database is `/data/feeder.db`, owned by 65532. Run the same `cp`, `rm` and `chown` there with those paths, then delete the helper pod. Then bring the replica back on the older release: `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.5.1 --namespace feeder --reset-then-reuse-values`, or roll back the release: `helm history feeder -n feeder` lists the revisions, and `helm rollback feeder <revision> -n feeder` goes back to the last one that ran 1.0.0-beta.5.1 (the one before the upgrade, which is not always the highest number below the current one if you changed values in between). `helm rollback` scales the deployment back up, so restore the database first.

   Everything Feeder recorded after the upgrade (Plan changes, Stock, new Recipes, Base recipes) is gone with the restore; images in `/data/images` stay. Restore the file as `feeder.db` owned by uid/gid 65532, as in Restore above. Do not start the new image on the restored file: it migrates it again.
6. **Skipping releases.** When you upgrade across more than one release, each migration group has its own snapshot, all taken before any migration runs, and each goes back to the image just before it. Pick the file for the release you want to return to:

   | Snapshot | Restore it to go back to |
   |---|---|
   | `feeder-pre-1540.db` | 1.0.0-beta.5.1 |
   | `feeder-pre-1500.db` | 1.0.0-beta.4.2 |
   | `feeder-pre-1400.db` | 1.0.0-beta.3 |

   For example, a database upgraded from 1.0.0-beta.4.2 straight to 1.0.0-beta.6 holds `feeder-pre-1500.db` and `feeder-pre-1540.db`, and both are the beta.4.2 database, so restore `feeder-pre-1500.db` and run the 1.0.0-beta.4.2 image. `feeder-pre-1400.db` exists only when the database had Planned Meals before beta.4. Restore one file only, run the image in the table, and do not start a newer image on the restored file.

### Upgrading to 1.0.0-beta.7

This release adds Supplies (dish soap, toilet paper, batteries), the new Scan screen and reading the Receipt from a photo, so read this before you upgrade. It starts from any 1.0.0-beta.6.x.

1. Take a backup first (Admin: `POST /api/admin/backups`, or copy `/data/backups` and `/data/images`). Migrations run at start and are forward-only.
2. Upgrade. Kubernetes: `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.7 --namespace feeder --reset-then-reuse-values`. Docker or compose: pull the new image and restart. **There is no new configuration:** no new environment variable, Helm value or secret.
3. One migration runs on the first start: `1550` adds the kind (`food` or `supply`) and the Restock level to Ingredients. It only adds two columns, with no table rebuild: every existing Ingredient becomes food with no Restock level, and its Products, Prices and Stock Lots stay as they were.
4. **The pre-1550 snapshot.** If the database already has applied migrations, Feeder first takes a verified snapshot as `feeder-pre-1550.db` in `/data/backups` (on Docker, the `backups` folder of the data volume; on Kubernetes, the `backups` folder of the PVC), before migration 1550 runs, with `integrity_check`. If it cannot be written, Feeder stops with a log line naming `feeder-pre-1550.db` and nothing is migrated. A fresh install takes none. An existing `feeder-pre-1550.db` is never replaced, so a start that failed after the snapshot keeps the true pre-upgrade file. The file is not listed in Settings, is never pruned by the nightly clean-up and stays until you delete it, so copy it off the volume if you want to keep it. The nightly snapshots (`feeder-YYYY-MM-DD.db`) are separate.
5. **A new data flow: receipt photos go to the configured AI provider.** Reading a Receipt sends up to 4 photos of it (re-encoded as JPEG with their metadata, GPS included, stripped), with today's Scanned list at that Shop (the Shop's name, the date and the currency, and each row's Product name, barcode, Base Unit, pack size, quantity and Price), from the server to the provider the Admin set up for the Recipe Assistant, the same one recipe photos go to ([ADR 0018](../adr/0018-receipt-reading.md)). Nothing else leaves: no Ingredient names, Lines, Members, Users, other Shops, the Household's name, Pictures or the Shopping List.
   - The photos are not stored: they live in the request and the read job's memory only, never on disk, in `/data/images`, in the database or in the phone's offline queue, and they are not written to the logs. Only the answer is kept, in memory for 10 minutes, so the User can review it; a read applied later is refused and has to be read again.
   - It uses the Recipe Assistant's settings and gate: the same base URL, key and model, and the same on/off switch. If the Recipe Assistant is off or has no key, reading a Receipt says so and nothing is sent. There is no separate switch.
   - It shares the Recipe Assistant's limit: the Household can make 30 accepted reads per rolling hour in all (recipe reads and receipt reads together), with one read running per User at a time. An Admin is not limited.
   - Any User may read a Receipt. The screen says that the photos and the Scanned list go to the provider and are not kept; tell the Household before you turn the Recipe Assistant on if that matters to you.
   - Reading needs a connection. Scanning and the Scanned list work offline as before and never wait for the assistant.
6. **Rolling back.** Migrations cannot be undone, so going back to 1.0.0-beta.6.5 means restoring the snapshot and running the older image. A `helm rollback` on its own does not restore the database:

```sh
docker stop feeder                                          # Kubernetes: kubectl -n feeder scale deploy/feeder --replicas=0
cp /srv/feeder/backups/feeder-pre-1550.db /srv/feeder/feeder.db
rm -f /srv/feeder/feeder.db-wal /srv/feeder/feeder.db-shm   # stale write-ahead files
chown 65532:65532 /srv/feeder/feeder.db
# run the older image: ghcr.io/fabbarix/feeder-ng:1.0.0-beta.6.5
```

   On Kubernetes the paths above are on the PVC, which you reach by mounting it in a helper pod while the deployment is scaled to zero (for example a pod with the PVC mounted at `/data` and an image that has `cp`, `rm` and `chown`). In the pod the snapshot is `/data/backups/feeder-pre-1550.db` and the database is `/data/feeder.db`, owned by 65532. Run the same `cp`, `rm` and `chown` there with those paths, then delete the helper pod. Then bring the replica back on the older release: `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.6.5 --namespace feeder --reset-then-reuse-values`, or roll back the release: `helm history feeder -n feeder` lists the revisions, and `helm rollback feeder <revision> -n feeder` goes back to the last one that ran 1.0.0-beta.6.5 (the one before the upgrade, which is not always the highest number below the current one if you changed values in between). `helm rollback` scales the deployment back up, so restore the database first.

   Everything Feeder recorded after the upgrade (Supplies, Restock levels, Scanned lists, Stock, new Recipes) is gone with the restore; images in `/data/images` stay. Restore the file as `feeder.db` owned by uid/gid 65532, as in Restore above. Do not start the new image on the restored file: it migrates it again. Receipt photos need no clean-up, because none were stored.
7. **Skipping releases.** When you upgrade across more than one release, each migration group has its own snapshot, all taken before any migration runs, and each goes back to the image just before it:

   | Snapshot | Restore it to go back to |
   |---|---|
   | `feeder-pre-1550.db` | 1.0.0-beta.6.5 |
   | `feeder-pre-1540.db` | 1.0.0-beta.5.1 |
   | `feeder-pre-1500.db` | 1.0.0-beta.4.2 |
   | `feeder-pre-1400.db` | 1.0.0-beta.3 |

   For example, a database upgraded from 1.0.0-beta.5.1 straight to 1.0.0-beta.7 holds `feeder-pre-1540.db` and `feeder-pre-1550.db`, and both are the beta.5.1 database, so restore `feeder-pre-1540.db` and run the 1.0.0-beta.5.1 image.
