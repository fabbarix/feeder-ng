# Deploying the Feeder

The Feeder is one container: a static Go binary with the web app embedded, and all state on one `/data` volume ([ADR 0004](../adr/0004-go-binary-sqlite-on-data-volume.md)). It speaks plain HTTP on port 8080 and expects an HTTPS reverse proxy in front: camera scanning, Web Push and Google sign-in all require HTTPS.

## Image

The image is published on GHCR and pulls anonymously once its package is public (no `docker login`):

```sh
docker pull ghcr.io/fabbarix/feeder-ng:1.0.0
```

| Tag | Published on | Meaning |
|---|---|---|
| `1.0.0-dev` | tag `v1.0.0-dev` | pre-release: use before the first stable tag; never `latest` |
| `1.0.0`, `1.0`, `1` | tag `v1.0.0` | exact version, latest patch of 1.0, latest 1.x (no `1` tag for 0.x) |
| `latest` | a `v*` tag without a `-` prerelease suffix | latest stable release; does not exist until the first stable tag |

Nothing is published from branches, and there is no moving branch tag. A semver tag already names one exact commit, and the image carries the commit in its OCI revision label.

All tags are multi-arch (`linux/amd64`, `linux/arm64`) and carry the OCI label `org.opencontainers.image.source`, which links the package to this repository.

Workflows:

- `.github/workflows/ci.yml`: runs `scripts/check.sh` on pull requests and on pushes to `main`. On pull requests it also builds the image without pushing it (and without any registry login), so a broken Dockerfile fails the PR. It never publishes.
- `.github/workflows/release.yml` ("Publish"): runs only on `v*` tags. It runs the checks, then builds and pushes the image with the `GITHUB_TOKEN` (`packages: write`, nothing else). It then packages the Helm chart with `--version` and `--app-version` taken from the tag (`v1.2.3` becomes `1.2.3`) and pushes it to `oci://ghcr.io/fabbarix/charts`. A failed release is re-run with *Re-run jobs* on the tag's run, which keeps the tag.

Images and the chart are published from `v*` tags only. `latest` is set only on stable tags (no `-` in the tag).

To release: `git tag v1.0.0 && git push origin v1.0.0`.

Before the first stable tag, release a pre-release instead: `git tag v1.0.0-dev && git push origin v1.0.0-dev` publishes image `1.0.0-dev` and chart `1.0.0-dev`, and never sets `latest`.

### Verify anonymous pull after the first push

Packages inherit visibility from the repository, and this repository is public, so the packages are usually public from their first push. The make-public step is usually unnecessary. After the first tag push (for example `v1.0.0-dev`), check from a machine with no `docker login` or `helm registry login`:

```sh
docker pull ghcr.io/fabbarix/feeder-ng:1.0.0-dev
helm pull oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-dev
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
| `FEEDER_DATA_DIR` | no | Default `/data` (the volume). |
| `FEEDER_ADDR` | no | Default `:8080`. |
| `FEEDER_DEV_LOGIN` | never in production | `1` enables a passwordless dev login. Leave unset. |

Google setup: `scripts/setup-google-auth.sh` (see [t6-google-auth-script.md](design/t6-google-auth-script.md)) creates the OAuth client; the authorised redirect URI is `$FEEDER_BASE_URL/auth/google/callback`. Web Push needs no Google or GCP setup: the Feeder creates its own VAPID keys on first start in `/data/vapid.json`. Do not delete that file, or every device has to turn notifications on again.

## docker run

```sh
docker run -d --name feeder --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v feeder-data:/data \
  -e FEEDER_ADMIN_EMAIL=you@example.com \
  -e FEEDER_BASE_URL=https://feeder.example.com \
  -e FEEDER_GOOGLE_CLIENT_ID=... \
  -e FEEDER_GOOGLE_CLIENT_SECRET=... \
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
volumes:
  feeder-data:
```

The image is distroless (no shell), so there is no `HEALTHCHECK`; let the proxy probe `GET /` instead.

## Kubernetes (Helm)

The chart is public too, published as an OCI artifact; installing it needs no login:

```sh
helm install feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0 \
  --namespace feeder --create-namespace \
  --set adminEmail=you@example.com \
  --set baseUrl=https://feeder.example.com \
  --set ingress.enabled=true --set ingress.className=nginx \
  --set ingress.tls.enabled=true --set ingress.tls.secretName=feeder-tls
```

The chart version equals the release (`v1.0.0` publishes chart `1.0.0` with `appVersion` `1.0.0`), and the image tag defaults to `appVersion`. Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version X --namespace feeder --reuse-values`. Source and the values table: `deploy/helm/feeder/README.md`.

- **One replica only.** The state is a SQLite file on a single volume, so the Deployment is fixed at one replica with the `Recreate` strategy (no overlap during upgrades) and must never be scaled.
- **Storage.** A PVC mounted at `/data` (`persistence.size`, `persistence.storageClass`, or `persistence.existingClaim`). `/data` must be writable by uid/gid 65532. The pod sets `fsGroup: 65532`, which makes most dynamically provisioned volumes writable, but `fsGroup` is not enough on its own: an `existingClaim` whose volume ignores `fsGroup` (hostPath, NFS, some CSI drivers) must be chowned beforehand with `chown 65532:65532` on the volume's directory. The root filesystem is read-only; only `/data` and an `emptyDir` `/tmp` are writable.
- **Google sign-in.** Create the OAuth client with `scripts/setup-google-auth.sh` (it prints the redirect URI `$baseUrl/auth/google/callback` and saves the client id and secret to `.env.local`). Put them in a Secret and reference it, so the secret never sits in values or shell history:

  ```sh
  kubectl -n feeder create secret generic feeder-google \
    --from-literal=client-id=... --from-literal=client-secret=...
  helm upgrade --install feeder oci://ghcr.io/fabbarix/charts/feeder --namespace feeder --reuse-values \
    --set google.existingSecret=feeder-google
  ```

  Keys default to `client-id` and `client-secret` (`google.clientIdKey`, `google.clientSecretKey`). For a quick trial you can instead pass `google.clientId` and `google.clientSecret`, and the chart creates the Secret.
- **Ingress.** The default annotations target ingress-nginx and make `/api/events` (server-sent events) work: `proxy-buffering: "off"`, one-hour `proxy-read-timeout` and `proxy-send-timeout`, `proxy-body-size: 10m`. Override single keys under `ingress.annotations` for other controllers.
- **Probes.** All three probes call `GET /api/health`.
- **Backups** still land in `/data/backups` on the PVC; copy them off the cluster as described below.

## Reverse proxy

Terminate TLS in front and forward to `127.0.0.1:8080`. Caddy:

```
feeder.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Traefik, nginx and others work the same way. Requirements:

- Forward the `Host` header unchanged and keep `FEEDER_BASE_URL` equal to the public URL: state-changing requests are rejected with 403 `cross_origin` when the `Origin` header does not match it.
- Do not buffer or time out the `/api/events` stream (server-sent events): disable response buffering for that path (`flush_interval -1` in Caddy, `proxy_buffering off` in nginx) and allow idle connections of several minutes.
- Large uploads: Recipe Files and photos are small, but allow request bodies of at least 10 MB.

## Backups

The Feeder writes a consistent SQLite snapshot (`VACUUM INTO`) to `/data/backups/feeder-YYYY-MM-DD.db` every night at 02:30 household time, and keeps the newest 7 daily snapshots plus the newest snapshot of each of the 4 most recent older weeks (about 11 files). An Admin can also take one at any time (`POST /api/admin/backups`) and list them (`GET /api/admin/backups`), for example before an upgrade.

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
