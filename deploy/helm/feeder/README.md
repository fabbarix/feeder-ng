# Feeder Helm chart

Runs the Feeder (family meal planning) on Kubernetes: one pod, the image from GHCR, and a PersistentVolumeClaim for its SQLite database. Both the chart and the image are public, so installing needs no registry login.

```sh
helm install feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.6.5 \
  --namespace feeder --create-namespace \
  --set adminEmail=you@example.com \
  --set baseUrl=https://feeder.example.com \
  --set ingress.enabled=true --set ingress.className=nginx \
  --set ingress.tls.enabled=true --set ingress.tls.secretName=feeder-tls
```

Prerelease charts need an explicit `--version` (or `--devel`). Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version X --namespace feeder --reset-then-reuse-values` (Helm 3.14 or newer). `--reuse-values` keeps the old computed values, so it misses the defaults a new chart adds (such as `secretKey.generate`); `--reset-then-reuse-values` re-applies the new defaults and then your own overrides. The chart version equals the release, and the image tag defaults to `appVersion`, so both match the release. Upgrades with `--set` or `--version` add `--reset-then-reuse-values` (or `--reuse-values`) so existing settings survive; the form matches `templates/NOTES.txt`.

No `latest` image exists until the first stable `v*` tag is published. Before then, use a prerelease tag such as `v1.0.0-beta.1`, which publishes image `1.0.0-beta.1` and chart `1.0.0-beta.1`: install with `--version 1.0.0-beta.1` (or add `--set image.tag=1.0.0-beta.1` to pin the image explicitly). Prereleases never get the `latest`, `1.0` or `1` image tags. (The earlier prerelease tag was `v1.0.0-dev`.) Only tags publish; there are no branch builds.

Lint the chart with the CI values: `helm lint deploy/helm/feeder -f deploy/helm/feeder/ci/lint-values.yaml`. The `ci/` folder is excluded from the packaged chart by `.helmignore`.

## Constraints

- **Never scale it.** The state is one SQLite file on one volume. The Deployment is fixed at `replicas: 1` with the `Recreate` strategy, and there is no `replicaCount` value (the schema rejects it).
- **Single-writer storage.** The default PVC is `ReadWriteOnce`. Set `persistence.existingClaim` to reuse one.
- **Read-only root filesystem.** The app writes only to `/data` (the volume) and `/tmp` (an emptyDir). Runs as uid/gid 65532 with `fsGroup: 65532`.
- **`/data` ownership.** `/data` must be writable by uid/gid 65532. `fsGroup: 65532` makes most dynamically provisioned volumes writable, but `fsGroup` is not enough on its own: an `existingClaim` whose volume ignores `fsGroup` (hostPath, NFS, some CSI drivers) must be chowned beforehand with `chown 65532:65532` on the volume's directory.
- **Fixed port.** `FEEDER_ADDR` must stay `:8080` under the chart: the container port, the Service target and the probes are hardcoded to 8080.
- **HTTPS in front.** Camera scanning, Web Push and Google sign-in need HTTPS, so `baseUrl` is the public https URL and an ingress or proxy must terminate TLS.

## Google sign-in

Preferred: create the Secret yourself, so the secret never sits in values or shell history:

```sh
kubectl -n feeder create secret generic feeder-google \
  --from-literal=client-id=... --from-literal=client-secret=...
helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --namespace feeder --reset-then-reuse-values \
  --set google.existingSecret=feeder-google
```

Keys default to `client-id` and `client-secret` (`google.clientIdKey`, `google.clientSecretKey`). For a trial, `google.clientId` and `google.clientSecret` make the chart create the Secret `<fullname>-google`. With neither, Google env is not rendered and sign-in stays disabled.

## Recipe Assistant secret key

The Recipe Assistant encrypts its API key at rest with `FEEDER_SECRET_KEY`: 32 random bytes in base64. It always comes from a Secret; there is no inline value, and the schema rejects `secretKey.value`; the template refuses `env.FEEDER_SECRET_KEY` and a plain-value `extraEnv` entry for it. A `valueFrom` entry named `FEEDER_SECRET_KEY` in `extraEnv` is allowed, for an external secret store: it replaces the generated entry, and the chart then creates no Secret of its own.

- **Default (`secretKey.generate: true`).** The chart creates Secret `<fullname>-secret-key` with a random key, reuses it on every upgrade (it looks the Secret up with `lookup`), and keeps it when the release is uninstalled (`helm.sh/resource-policy: keep`), so a reinstall finds the same key. Changing `secretKey.key` on an existing install generates a new key (the kept Secret has no value under the new name), so an Admin must enter the Recipe Assistant's API key again.
- **Your own Secret (`secretKey.existingSecret`).** Wins over `generate`; the chart creates no Secret. `secretKey.key` names the key inside it (default `secret-key`).

  ```sh
  kubectl -n feeder create secret generic feeder-secret-key \
    --from-literal=secret-key="$(openssl rand -base64 32)"
  helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.6.5 --namespace feeder \
    --reset-then-reuse-values --set secretKey.existingSecret=feeder-secret-key
  ```
- **Off (`secretKey.generate: false`, no `existingSecret`).** No Secret and no `FEEDER_SECRET_KEY`: the Recipe Assistant stays off.
- **Argo CD, Flux and `helm template`.** `lookup` returns nothing under `helm template`, client `--dry-run` and offline renders, so each render generates a new key and the Secret would flip on every sync. In those setups set `secretKey.existingSecret`.
- **Losing or rotating the key.** If the key is lost or replaced, the stored API key can no longer be read and an Admin must re-enter the API key; nothing else is affected. There is no previous-key setting (no `_PREVIOUS` variable). To rotate: replace the Secret's value, run `kubectl -n feeder rollout restart deploy/feeder`, then re-enter the API key in Settings. Keep the key out of backups of the data volume.
- **Upgrading from 1.0.0-dev.** Use `--reset-then-reuse-values` (Helm 3.14 or newer), or add `--set secretKey.generate=true`. Plain `--reuse-values` reuses the old values, which have no `secretKey`, so no key is created.

The Ingress allows request bodies up to `50m` (`proxy-body-size`): photo reads send up to 45 MiB, and ingress-nginx allows only 1 MB by default.

The Google OAuth client is read from `FEEDER_GOOGLE_CLIENT_ID` and `FEEDER_GOOGLE_CLIENT_SECRET` (see Google sign-in above).

## Values

| Key | Default | Description |
|---|---|---|
| `image.repository` | `ghcr.io/fabbarix/feeder-ng` | Image without the tag. |
| `image.tag` | `""` | Tag. Empty uses `.Chart.AppVersion`. |
| `image.pullPolicy` | `IfNotPresent` | Image pull policy. |
| `imagePullSecrets` | `[]` | Pull secrets. Not needed for the public image. |
| `nameOverride` | `""` | Overrides the chart name in resource names. |
| `fullnameOverride` | `""` | Overrides the full resource name. |
| `adminEmail` | `""` | **Required.** Email of the first Admin (`FEEDER_ADMIN_EMAIL`). |
| `baseUrl` | `""` | **Required.** Public https URL, no trailing slash (`FEEDER_BASE_URL`). |
| `google.clientId` | `""` | Google OAuth client id. Creates Secret `<fullname>-google` when `existingSecret` is empty. |
| `google.clientSecret` | `""` | Google OAuth client secret. Same Secret as above. |
| `google.existingSecret` | `""` | Name of an existing Secret with the client id and secret. No Secret is created when set. |
| `google.clientIdKey` | `client-id` | Key of the client id inside the Secret. |
| `google.clientSecretKey` | `client-secret` | Key of the client secret inside the Secret. |
| `secretKey.generate` | `true` | Create Secret `<fullname>-secret-key` with a random `FEEDER_SECRET_KEY` (kept on upgrade and uninstall). |
| `secretKey.existingSecret` | `""` | Name of a Secret holding the key. Wins over `generate`; no Secret is created. |
| `secretKey.key` | `secret-key` | Key inside the Secret (existing or generated). |
| `env` | `{}` | Extra plain environment variables, e.g. `TZ`. `FEEDER_ADDR` must stay `:8080`. Never set `FEEDER_DEV_LOGIN`. |
| `extraEnv` | `[]` | Raw container env entries (may use `valueFrom`). |
| `trustProxy` | `null` | `FEEDER_TRUST_PROXY`. `null` is automatic: `true` when `ingress.enabled`, else `false`. `true` or `false` overrides. Set `true` only when a proxy appends the real client address as the last `X-Forwarded-For` entry. |
| `service.type` | `ClusterIP` | Service type. |
| `service.port` | `80` | Service port. Targets the container's `http` port (8080). |
| `ingress.enabled` | `false` | Create an Ingress. |
| `ingress.className` | `""` | Ingress class name. |
| `ingress.annotations` | ingress-nginx SSE defaults | `proxy-buffering: "off"`, `proxy-read-timeout` and `proxy-send-timeout` `"3600"`, `proxy-body-size: 50m`. Maps merge, so override single keys. |
| `ingress.host` | `""` | Host name. Empty uses the host of `baseUrl`. |
| `ingress.tls.enabled` | `false` | Add a TLS section for the host. |
| `ingress.tls.secretName` | `""` | TLS Secret name. Empty omits `secretName` (cert-manager or the controller's default certificate). |
| `persistence.enabled` | `true` | `false` mounts an emptyDir at `/data`: data is lost on restart (trials only). |
| `persistence.existingClaim` | `""` | Use this PVC. No PVC is created when set. |
| `persistence.storageClass` | `""` | Storage class. Empty uses the cluster default; `"-"` renders `storageClassName: ""`. |
| `persistence.size` | `1Gi` | Requested size. |
| `persistence.accessModes` | `[ReadWriteOnce]` | Access modes. |
| `persistence.annotations` | `{}` | Annotations on the PVC. |
| `podSecurityContext` | non-root 65532, `fsGroup: 65532`, `fsGroupChangePolicy: OnRootMismatch` | Pod security context. |
| `securityContext` | read-only root, no privilege escalation, all capabilities dropped | Container security context. |
| `resources` | requests 50m CPU / 64Mi memory, limit 512Mi memory | Container resources. |
| `nodeSelector` | `{}` | Node selector. |
| `tolerations` | `[]` | Tolerations. |
| `affinity` | `{}` | Affinity. |
| `podAnnotations` | `{}` | Pod annotations. |
| `podLabels` | `{}` | Extra pod labels. |
| `serviceAccount.create` | `true` | Create a ServiceAccount. |
| `serviceAccount.name` | `""` | ServiceAccount name. Empty uses the fullname when created, otherwise `default`. |
| `serviceAccount.annotations` | `{}` | ServiceAccount annotations. |
| `serviceAccount.automount` | `false` | Mount the API token into the pod (the app does not need it). |
| `probes.startup` | period 2s, failure threshold 30 | Startup probe timing (`GET /api/health`). |
| `probes.liveness` | period 10s, failure threshold 3 | Liveness probe timing (`GET /api/health`). |
| `probes.readiness` | period 5s, failure threshold 3 | Readiness probe timing (`GET /api/health`). |

Values are validated against `values.schema.json`: unknown top-level keys (including `replicaCount`) and wrong types fail the install.

## Backups

The app writes nightly SQLite snapshots to `/data/backups` on the PVC, and `/data/images` holds the photos. Copy both off the cluster (for example with `kubectl cp` or a backup job); see [docs/dev/deploy.md](../../../docs/dev/deploy.md) for the restore procedure.
