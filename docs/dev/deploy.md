# Deploying the Feeder

The Feeder is one container: a static Go binary with the web app embedded, and all state on one `/data` volume ([ADR 0004](../adr/0004-go-binary-sqlite-on-data-volume.md)). It speaks plain HTTP on port 8080 and expects an HTTPS reverse proxy in front: camera scanning, Web Push and Google sign-in all require HTTPS.

## Image

Tagged releases are published to GHCR for `linux/amd64` and `linux/arm64`:

```
ghcr.io/fabbarix/feeder-ng:1.0.0     exact version
ghcr.io/fabbarix/feeder-ng:1.0       latest patch of 1.0
ghcr.io/fabbarix/feeder-ng:latest    latest stable release
```

`.github/workflows/release.yml` builds and pushes them when a tag `v*` is pushed (after `scripts/check.sh` passes); `.github/workflows/ci.yml` runs `scripts/check.sh` on every pull request.

## Building the image locally

```sh
make docker        # DOCKER_BUILDKIT=1 docker build -t feeder:dev .
```

The Dockerfile needs **BuildKit** (the default builder since Docker 23; on older engines set `DOCKER_BUILDKIT=1` or use `docker buildx build`): its stages use `FROM --platform=$BUILDPLATFORM` so the Go binary cross-compiles natively for each target architecture instead of running under emulation, and the legacy builder cannot parse that. The web stage builds with `web/tsconfig.build.json`, which excludes test files (they are still type-checked by `scripts/check.sh`); the Go build uses `-buildvcs=false`, because the image has no `.git` and the binary does not need VCS stamping.

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

The image runs as user `nonroot` (uid/gid 65532). A named volume works as is; for a bind mount, make the directory writable by that user: `sudo chown 65532:65532 /srv/feeder`.

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
