#!/usr/bin/env bash
# Renders the Helm chart in deploy/helm/feeder and asserts on the output.
# Contract: docs/dev/design/d1-deploy.md. Skips when helm or python yaml is missing.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART="$HERE/../../deploy/helm/feeder"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

if ! command -v helm >/dev/null 2>&1; then
  echo "SKIP: helm is not installed"; exit 0
fi
if ! python3 -c 'import yaml' >/dev/null 2>&1; then
  echo "SKIP: python3 yaml is not available"; exit 0
fi

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

# Chart files.
for f in Chart.yaml values.yaml values.schema.json README.md templates/NOTES.txt \
         templates/deployment.yaml templates/service.yaml templates/ingress.yaml \
         templates/pvc.yaml templates/secret.yaml; do
  [ -f "$CHART/$f" ] && ok || bad "deploy/helm/feeder/$f is missing"
done
if [ ! -f "$CHART/Chart.yaml" ]; then
  printf '%d passed, %d failed\n' "$PASS" "$FAIL"; exit 1
fi

BASE=(--set adminEmail=admin@example.com --set baseUrl=https://feeder.example.com)

# render NAME [helm args...] -> $OUT/NAME.yaml; fails the test when helm template fails.
render() {
  local name="$1"; shift
  if helm template feeder "$CHART" "${BASE[@]}" "$@" >"$OUT/$name.yaml" 2>"$OUT/$name.err"; then ok
  else bad "helm template failed for $name: $(head -c 300 "$OUT/$name.err")"; : >"$OUT/$name.yaml"; fi
}

# q NAME 'python expression' MESSAGE. The expression sees docs (list of manifests),
# kind(k) -> list of docs of that kind, dep -> the Deployment, pod -> its pod spec,
# c -> the feeder container, env -> {name: entry}.
q() {
  OUTFILE="$OUT/$1.yaml" python3 - "$2" <<'PY' && ok || bad "$1: $3"
import os, sys, yaml
docs = [d for d in yaml.safe_load_all(open(os.environ["OUTFILE"])) if d]
kind = lambda k: [d for d in docs if d.get("kind") == k]
dep = (kind("Deployment") or [{}])[0]
pod = dep.get("spec", {}).get("template", {}).get("spec", {})
c = (pod.get("containers") or [{}])[0]
env = {e["name"]: e for e in c.get("env", [])}
sys.exit(0 if eval(sys.argv[1]) else 1)
PY
}
qq() { q "$1" "$2" "$3"; }

# --- lint (defaults, with the required values) ---
if helm lint "$CHART" "${BASE[@]}" >"$OUT/lint.txt" 2>&1; then ok; else bad "helm lint failed: $(head -c 300 "$OUT/lint.txt")"; fi

# --- defaults ---
render defaults
qq defaults 'dep.get("spec",{}).get("replicas") == 1' "replicas must be 1"
qq defaults 'dep["spec"]["strategy"]["type"] == "Recreate"' "strategy must be Recreate"
qq defaults 'pod["securityContext"]["fsGroup"] == 65532' "fsGroup must be 65532"
qq defaults 'pod["securityContext"]["runAsNonRoot"] is True and pod["securityContext"]["runAsUser"] == 65532 and pod["securityContext"]["runAsGroup"] == 65532' "pod must run non-root as 65532:65532"
qq defaults 'c["securityContext"]["readOnlyRootFilesystem"] is True and c["securityContext"]["capabilities"]["drop"] == ["ALL"] and c["securityContext"]["allowPrivilegeEscalation"] is False' "container must drop all capabilities and have a read-only root"
qq defaults 'any(m["mountPath"] == "/tmp" for m in c["volumeMounts"]) and any(m["mountPath"] == "/data" for m in c["volumeMounts"])' "/data and an emptyDir /tmp must be mounted"
qq defaults 'any("emptyDir" in v for v in pod["volumes"])' "/tmp must be an emptyDir"
APPVER="$(sed -n 's/^appVersion:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p' "$CHART/Chart.yaml")"
qq defaults "c['image'] == 'ghcr.io/fabbarix/feeder-ng:$APPVER' and '$APPVER' != ''" "image must default to ghcr.io/fabbarix/feeder-ng:<appVersion>"
qq defaults '"imagePullSecrets" not in pod' "imagePullSecrets must be empty by default"
for p in startupProbe livenessProbe readinessProbe; do
  qq defaults "c['$p']['httpGet']['path'] == '/api/health' and c['$p']['httpGet']['port'] == 'http'" "$p must GET /api/health on port http"
done
qq defaults 'env["FEEDER_ADMIN_EMAIL"]["value"] == "admin@example.com" and env["FEEDER_BASE_URL"]["value"] == "https://feeder.example.com"' "admin email and base URL env"
qq defaults '"FEEDER_DEV_LOGIN" not in env' "FEEDER_DEV_LOGIN must never be set by default"
qq defaults '"FEEDER_GOOGLE_CLIENT_ID" not in env and not [x for x in kind("Secret") if x["metadata"]["name"].endswith("-google")]' "no Google env and no Google Secret by default (the secret-key Secret is separate, REL-1)"
qq defaults 'len(kind("PersistentVolumeClaim")) == 1 and kind("PersistentVolumeClaim")[0]["spec"]["accessModes"] == ["ReadWriteOnce"] and kind("PersistentVolumeClaim")[0]["spec"]["resources"]["requests"]["storage"] == "1Gi"' "a 1Gi RWO PVC by default"
qq defaults 'len(kind("Service")) == 1 and not kind("Ingress")' "a Service and no Ingress by default"
qq defaults 'any(p["containerPort"] == 8080 and p["name"] == "http" for p in c["ports"])' "container port http 8080"
qq defaults 'len(kind("ServiceAccount")) == 1 and pod["serviceAccountName"]' "a ServiceAccount"

# --- image tag override, extra env ---
render tag --set image.tag=9.9.9 --set env.TZ=Europe/Rome \
  --set 'extraEnv[0].name=LANG' --set 'extraEnv[0].value=C.UTF-8'
qq tag 'c["image"] == "ghcr.io/fabbarix/feeder-ng:9.9.9"' "image.tag must override the appVersion"
qq tag 'env["TZ"]["value"] == "Europe/Rome" and env["LANG"]["value"] == "C.UTF-8"' "env and extraEnv must be rendered"

# --- ingress + TLS ---
render ingress --set ingress.enabled=true --set ingress.className=nginx \
  --set ingress.host=feeder.example.com --set ingress.tls.enabled=true --set ingress.tls.secretName=feeder-tls
qq ingress 'len(kind("Ingress")) == 1' "an Ingress must be rendered"
qq ingress '(lambda i: i["spec"]["tls"][0]["secretName"] == "feeder-tls" and i["spec"]["tls"][0]["hosts"] == ["feeder.example.com"] and i["spec"]["rules"][0]["host"] == "feeder.example.com" and i["spec"]["ingressClassName"] == "nginx")(kind("Ingress")[0])' "Ingress host, class and TLS"
qq ingress '(lambda a: a["nginx.ingress.kubernetes.io/proxy-buffering"] == "off" and a["nginx.ingress.kubernetes.io/proxy-read-timeout"] == "3600" and a["nginx.ingress.kubernetes.io/proxy-send-timeout"] == "3600")(kind("Ingress")[0]["metadata"]["annotations"])' "SSE annotations (buffering off, long timeouts)"
render ingress-override --set ingress.enabled=true --set-string 'ingress.annotations.nginx\.ingress\.kubernetes\.io/proxy-read-timeout=7200'
qq ingress-override 'kind("Ingress")[0]["metadata"]["annotations"]["nginx.ingress.kubernetes.io/proxy-read-timeout"] == "7200" and kind("Ingress")[0]["metadata"]["annotations"]["nginx.ingress.kubernetes.io/proxy-buffering"] == "off"' "a user can override one SSE annotation and keep the others"
render ingress-host --set ingress.enabled=true
qq ingress-host 'kind("Ingress")[0]["spec"]["rules"][0]["host"] == "feeder.example.com"' "ingress host falls back to the baseUrl host"

# --- FEEDER_TRUST_PROXY: automatic from ingress.enabled, explicit values override ---
qq defaults 'env["FEEDER_TRUST_PROXY"]["value"] == "false"' "FEEDER_TRUST_PROXY must be false by default (no ingress)"
qq ingress 'env["FEEDER_TRUST_PROXY"]["value"] == "true"' "FEEDER_TRUST_PROXY must be true automatically when the ingress is enabled"
render trust-true --set trustProxy=true
qq trust-true 'env["FEEDER_TRUST_PROXY"]["value"] == "true"' "trustProxy=true must win without an ingress"
render trust-false --set ingress.enabled=true --set trustProxy=false
qq trust-false 'env["FEEDER_TRUST_PROXY"]["value"] == "false"' "trustProxy=false must win with the ingress enabled"

# --- google.existingSecret ---
render existing-secret --set google.existingSecret=my-google
qq existing-secret 'env["FEEDER_GOOGLE_CLIENT_ID"]["valueFrom"]["secretKeyRef"] == {"name": "my-google", "key": "client-id"} and env["FEEDER_GOOGLE_CLIENT_SECRET"]["valueFrom"]["secretKeyRef"] == {"name": "my-google", "key": "client-secret"}' "Google env must reference the existing Secret with the default keys"
qq existing-secret 'not [x for x in kind("Secret") if x["metadata"]["name"].endswith("-google")]' "no Google Secret may be created when google.existingSecret is set"
render existing-secret-keys --set google.existingSecret=my-google --set google.clientIdKey=id --set google.clientSecretKey=sec
qq existing-secret-keys 'env["FEEDER_GOOGLE_CLIENT_ID"]["valueFrom"]["secretKeyRef"]["key"] == "id" and env["FEEDER_GOOGLE_CLIENT_SECRET"]["valueFrom"]["secretKeyRef"]["key"] == "sec"' "configurable Secret keys"

# --- inline Google values -> chart-created Secret ---
render inline-google --set google.clientId=cid-123 --set google.clientSecret=csec-456
qq inline-google '[x["metadata"]["name"] for x in kind("Secret") if x["metadata"]["name"].endswith("-google")] == ["feeder-google"]' "a Secret feeder-google must be created for inline values"
qq inline-google 'env["FEEDER_GOOGLE_CLIENT_ID"]["valueFrom"]["secretKeyRef"] == {"name": "feeder-google", "key": "client-id"}' "inline client id must come from the created Secret"
qq inline-google 'str(dep).find("csec-456") < 0 and str(dep).find("cid-123") < 0' "client id and secret must not appear in the Deployment"

# --- existingClaim ---
render claim --set persistence.existingClaim=my-claim
qq claim 'not kind("PersistentVolumeClaim")' "no PVC may be created with existingClaim"
qq claim 'any(v.get("persistentVolumeClaim", {}).get("claimName") == "my-claim" for v in pod["volumes"])' "the pod must mount existingClaim"
render pvc-opts --set persistence.storageClass=fast --set persistence.size=5Gi
qq pvc-opts 'kind("PersistentVolumeClaim")[0]["spec"]["storageClassName"] == "fast" and kind("PersistentVolumeClaim")[0]["spec"]["resources"]["requests"]["storage"] == "5Gi"' "PVC storageClass and size"
render no-persist --set persistence.enabled=false
qq no-persist 'not kind("PersistentVolumeClaim") and any(m["mountPath"] == "/data" for m in c["volumeMounts"])' "persistence.enabled=false falls back to an emptyDir /data"

# --- scheduling and misc passthrough ---
render sched --set 'nodeSelector.disk=ssd' --set-string 'podAnnotations.a=b' --set serviceAccount.create=false --set imagePullSecrets[0].name=regcred
qq sched 'pod["nodeSelector"] == {"disk": "ssd"} and dep["spec"]["template"]["metadata"]["annotations"]["a"] == "b" and not kind("ServiceAccount") and pod["imagePullSecrets"] == [{"name": "regcred"}]' "nodeSelector, podAnnotations, serviceAccount and imagePullSecrets"

# --- negative cases ---
neg() { # NAME MESSAGE helm-args...
  local name="$1" msg="$2"; shift 2
  if helm template feeder "$CHART" "$@" >/dev/null 2>"$OUT/$name.err"; then bad "$msg"; else ok; fi
}
neg no-admin "rendering without adminEmail must fail" --set baseUrl=https://f.example.com
neg no-baseurl "rendering without baseUrl must fail" --set adminEmail=a@example.com
neg replicas "replicaCount must be rejected by the schema (SQLite: never scale)" "${BASE[@]}" --set replicaCount=2
neg bad-type "a wrong type must be rejected by the schema" "${BASE[@]}" --set-string ingress.enabled=yes

# --- docs mention the SQLite single-replica rule and anonymous install ---
grep -qi 'sqlite' "$CHART/README.md" 2>/dev/null && ok || bad "chart README must say it cannot be scaled (SQLite)"
grep -q 'oci://ghcr.io/fabbarix/charts/feeder' "$CHART/README.md" 2>/dev/null && ok || bad "chart README must show the anonymous helm install from oci://ghcr.io/fabbarix/charts/feeder"
grep -q 'helm' "$CHART/templates/NOTES.txt" 2>/dev/null && ok || bad "NOTES.txt must tell the user what to do next"

# --- review fixes (d1-deploy) ---
ROOT="$CHART/../../.."
DEPLOY_MD="$ROOT/docs/dev/deploy.md"
DESIGN_MD="$ROOT/docs/dev/design/d1-deploy.md"
README="$CHART/README.md"

# lint with the CI values file
if helm lint "$CHART" -f "$CHART/ci/lint-values.yaml" >"$OUT/lint-ci.txt" 2>&1; then ok
else bad "helm lint with ci/lint-values.yaml must pass (file missing or invalid): $(head -c 300 "$OUT/lint-ci.txt")"; fi

# the schema must allow the Helm-reserved global key; Google values must come as a pair
render global --set global.foo=1
neg google-id-only "setting only google.clientId must fail rendering" "${BASE[@]}" --set google.clientId=cid
neg google-secret-only "setting only google.clientSecret must fail rendering" "${BASE[@]}" --set google.clientSecret=csec

# FEEDER_ADDR is fixed at :8080 under the chart (port, Service and probes are hardcoded)
for f in "$CHART/values.yaml" "$README" "$DESIGN_MD"; do
  if grep -E '(e\.g\.|example|such as)[^.]*FEEDER_ADDR' "$f" >/dev/null 2>&1; then bad "$(basename "$f") must not offer FEEDER_ADDR as an example extra env"; else ok; fi
done
grep -E 'FEEDER_ADDR[^.]*(must|stay|remain)[^.]*:8080|(must|stay|remain)[^.]*:8080[^.]*FEEDER_ADDR' "$README" >/dev/null 2>&1 \
  && ok || bad "chart README must state FEEDER_ADDR must stay :8080 under the chart"

# every helm upgrade names the namespace; ones with --set or --version reuse values
upgrade_check() { # FILE
  python3 - "$1" <<'PY'
import re, sys
text = open(sys.argv[1]).read().replace("\\\n", " ")
bad = []
for m in re.finditer(r"helm upgrade[^\n`]*", text):
    cmd = m.group(0)
    if "--namespace feeder" not in cmd and "-n feeder" not in cmd:
        bad.append("no --namespace feeder: " + cmd)
    if ("--set" in cmd or "--version" in cmd) and "--reuse-values" not in cmd and "--reset-then-reuse-values" not in cmd:
        bad.append("no --reuse-values or --reset-then-reuse-values: " + cmd)
if not re.search(r"helm upgrade", text):
    bad.append("no helm upgrade found")
print("\n".join(bad)); sys.exit(1 if bad else 0)
PY
}
for f in "$DEPLOY_MD" "$README"; do
  if r="$(upgrade_check "$f" 2>&1)"; then ok; else bad "$(basename "$f"): helm upgrade commands: $r"; fi
done

# /data ownership: fsGroup alone is not enough on every volume type
for f in "$DEPLOY_MD" "$README"; do
  b="$(basename "$f")"
  grep -Eq '/data[^.]*writable[^.]*65532|65532[^.]*writable' "$f" && ok || bad "$b must state /data must be writable by uid/gid 65532"
  grep -Eqi 'existingClaim[^.]*(ignore|does not honou?r)[^.]*fsGroup|fsGroup[^.]*(ignor|not honou?r)[^.]*(hostPath|NFS|CSI)' "$f" && ok || bad "$b must warn that an existingClaim whose volume ignores fsGroup (hostPath, NFS, some CSI) needs care"
  grep -Eq 'chown[^.]*65532:65532' "$f" && ok || bad "$b must say to chown 65532:65532 beforehand"
  if grep -Eqi 'fsGroup[^.]*(alone|by itself)[^.]*(makes|is enough|suffices)|fsGroup (makes|makes the volume) writable' "$f"; then bad "$b must not claim fsGroup alone makes the volume writable"; else ok; fi
done

# docs: package visibility is irreversible, no first-person hedging, latest tag caveat
grep -Eqi 'cannot be undone|can.t be undone|irreversible|cannot be made private' "$DEPLOY_MD" && ok || bad "deploy.md must say making a package public cannot be undone"
if grep -Eqi 'to my knowledge|i am not certain|i think|i believe|i am not sure' "$DEPLOY_MD"; then bad "deploy.md must not hedge in the first person"; else ok; fi
grep -Eqi 'no .?latest.? (image|tag)[^.]*(until|before)[^.]*(stable|v\*)|latest[^.]*(only|not)[^.]*(exist|published)[^.]*(until|before)' "$README" \
  && ok || bad "chart README must say no latest image exists until the first stable v* tag"

# --- d2-release-tags: only v* tags publish; no :main image anywhere ---
REL="$ROOT/.github/workflows/release.yml"
for f in "$DEPLOY_MD" "$README" "$REL" "$ROOT/.github/workflows/ci.yml"; do
  b="$(basename "$f")"
  if grep -Eq 'feeder-ng:main|image\.tag[= ]main|tag[ =]main\b|\| `main` \||sha-<short>' "$f"; then bad "$b must not reference a main or sha-<short> image"; else ok; fi
done
grep -q 'image.tag=v1.0.0-dev\|v1.0.0-dev' "$README" && ok || bad "chart README must tell users to use a pre-release tag such as v1.0.0-dev before the first stable tag"
grep -Eq 'v1\.0\.0-dev' "$DEPLOY_MD" && ok || bad "deploy.md must name a pre-release tag such as v1.0.0-dev for use before the first stable tag"
grep -Eqi 'git tag v[0-9.]+(-[a-z0-9.]+)? && git push origin v' "$DEPLOY_MD" && ok || bad "deploy.md must show the release as pushing a v* tag"
grep -Eqi 'only (on|from|for)[^.]*`?v\*`? tags?|tags? only|only[^.]*tagged' "$DEPLOY_MD" && ok || bad "deploy.md must say images are published from v* tags only"
grep -Eqi 'latest[^.]*(only|just)[^.]*stable|stable[^.]*only[^.]*latest' "$DEPLOY_MD" && ok || bad "deploy.md must say latest comes only from stable tags"
grep -Eqi 'usually (not needed|unnecessary)|not usually needed' "$DEPLOY_MD" && ok || bad "deploy.md must say the make-public step is usually unnecessary for a public repository"
grep -Eqi 'inherit' "$DEPLOY_MD" && ok || bad "deploy.md must say packages inherit visibility from a public repository"
grep -Eqi 'verify[^.]*anonymous' "$DEPLOY_MD" && ok || bad "deploy.md must tell the reader to verify an anonymous pull after the first push"
grep -Eqi '401' "$DEPLOY_MD" && ok || bad "deploy.md must keep the make-public steps as a fallback for a 401/denied pull"
if grep -Eqi 'GHCR creates packages as \*\*private\*\*, even in a public' "$DEPLOY_MD"; then bad "deploy.md must no longer claim packages are always private in a public repository"; else ok; fi

# probe path registered in the Go code
grep -rq '"GET /api/health"' "$CHART/../../../internal" --include=*.go && ok || bad "the probe path /api/health must be registered in internal/"

# --- REL-1 (docs/dev/design/rel1-deploy.md): release 1.0.0-beta.1 and FEEDER_SECRET_KEY ---
CHART_VER="$(sed -n 's/^version:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p' "$CHART/Chart.yaml")"
# The chart and app versions are the release being cut (a v* tag sets both again when it publishes).
case "$CHART_VER" in 1.0.0-beta.[0-9]*|1.0.0-rc.[0-9]*|[0-9]*.[0-9]*.[0-9]*) ok ;; *) bad "Chart.yaml version must be a release version (got '$CHART_VER')" ;; esac
[ "$APPVER" = "$CHART_VER" ] && ok || bad "Chart.yaml appVersion must equal its version $CHART_VER (got '$APPVER')"
# Packaging exactly as release.yml does for tag v1.0.0-beta.1: the prerelease version must be accepted and name the file.
PKG="$OUT/pkg"; mkdir -p "$PKG"
if helm package "$CHART" --version "$CHART_VER" --app-version "$CHART_VER" --destination "$PKG" >"$OUT/pkg.txt" 2>&1 \
   && [ -f "$PKG/feeder-$CHART_VER.tgz" ]; then ok; else bad "helm package --version $CHART_VER must produce feeder-$CHART_VER.tgz: $(head -c 300 "$OUT/pkg.txt")"; fi

# Ingress body size: photo reads send up to 45 MiB, nginx defaults to 1 MB (10m is too small).
qq ingress '(lambda a: a["nginx.ingress.kubernetes.io/proxy-body-size"] == "50m")(kind("Ingress")[0]["metadata"]["annotations"])' "ingress proxy-body-size must be 50m (45 MiB photo reads)"

SK_SECRET='[s for s in kind("Secret") if s["metadata"]["name"] == "feeder-secret-key"]'
# 1. generate on install (the default): one Secret, 32 random bytes in base64, kept on uninstall, referenced by the Deployment.
qq defaults "len($SK_SECRET) == 1" "default values must render exactly one Secret feeder-secret-key (secretKey.generate defaults to true)"
qq defaults "(lambda v: len(__import__('base64').b64decode(v, validate=True)) == 32 and len(v) == 44)(($SK_SECRET[0].get('stringData') or {}).get('secret-key') or __import__('base64').b64decode($SK_SECRET[0]['data']['secret-key']).decode())" "the generated secret-key must be 44 characters of base64 for exactly 32 bytes"
qq defaults "$SK_SECRET[0]['metadata']['annotations']['helm.sh/resource-policy'] == 'keep'" "the generated Secret must carry helm.sh/resource-policy: keep"
qq defaults 'env["FEEDER_SECRET_KEY"]["valueFrom"]["secretKeyRef"] == {"name": "feeder-secret-key", "key": "secret-key"} and "value" not in env["FEEDER_SECRET_KEY"]' "FEEDER_SECRET_KEY must come from secretKeyRef feeder-secret-key/secret-key, never a plain value"
# The key never appears in the Deployment, NOTES or any non-Secret manifest.
python3 - "$OUT/defaults.yaml" <<'PY' && ok || bad "the generated key must appear only in the Secret manifest"
import sys, yaml, base64
docs = [d for d in yaml.safe_load_all(open(sys.argv[1])) if d]
sec = [d for d in docs if d.get("kind") == "Secret" and d["metadata"]["name"].endswith("-secret-key")]
if not sec: sys.exit(1)
v = sec[0].get("stringData", {}).get("secret-key") or base64.b64decode(sec[0]["data"]["secret-key"]).decode()
sys.exit(1 if any(v in str(d) for d in docs if d.get("kind") != "Secret") else 0)
PY
# Offline `lookup` returns nothing, so every render generates a fresh value. That is the documented GitOps caveat;
# the test pins it so nobody believes `helm template` keeps the key.
render defaults2
v1="$(OUTFILE="$OUT/defaults.yaml" python3 -c 'import os,yaml;print([d for d in yaml.safe_load_all(open(os.environ["OUTFILE"])) if d and d.get("kind")=="Secret" and d["metadata"]["name"]=="feeder-secret-key"][0]["stringData"]["secret-key"])' 2>/dev/null)"
v2="$(OUTFILE="$OUT/defaults2.yaml" python3 -c 'import os,yaml;print([d for d in yaml.safe_load_all(open(os.environ["OUTFILE"])) if d and d.get("kind")=="Secret" and d["metadata"]["name"]=="feeder-secret-key"][0]["stringData"]["secret-key"])' 2>/dev/null)"
[ -n "$v1" ] && [ -n "$v2" ] && [ "$v1" != "$v2" ] && ok || bad "two offline renders must generate two different keys (random, lookup finds nothing offline)"

# 2. persistence: lookup() is not testable offline (no cluster). Assert the template source implements it.
SKT="$CHART/templates/secret-key.yaml"
[ -f "$SKT" ] && ok || bad "templates/secret-key.yaml is missing"
grep -Eq 'lookup[[:space:]]+"v1"[[:space:]]+"Secret"[[:space:]]+\.Release\.Namespace' "$SKT" 2>/dev/null && ok || bad "secret-key.yaml must lookup the existing Secret in .Release.Namespace to keep the key on upgrade"
grep -q 'randBytes 32' "$SKT" 2>/dev/null && ok || bad "secret-key.yaml must generate with randBytes 32"
grep -q 'helm.sh/resource-policy: keep' "$SKT" 2>/dev/null && ok || bad "secret-key.yaml must carry helm.sh/resource-policy: keep"
# the existing value is reused as is (the lookup result's data is already base64): no regenerate branch when found
grep -Eq 'if[^}]*\$?(existing|found|current|old)|default[^}]*\.data' "$SKT" 2>/dev/null && ok || bad "secret-key.yaml must reuse the looked-up value when the Secret exists"

# 3. existingSecret wins over the default generate: true.
render sk-existing --set secretKey.existingSecret=my-key
qq sk-existing 'not [s for s in kind("Secret") if s["metadata"]["name"].endswith("-secret-key")] and env["FEEDER_SECRET_KEY"]["valueFrom"]["secretKeyRef"] == {"name": "my-key", "key": "secret-key"}' "existingSecret must render no Secret and point secretKeyRef at it"
render sk-existing-key --set secretKey.existingSecret=my-key --set secretKey.key=k
qq sk-existing-key 'env["FEEDER_SECRET_KEY"]["valueFrom"]["secretKeyRef"] == {"name": "my-key", "key": "k"}' "secretKey.key must set the key inside the existing Secret"
render sk-gen-key --set secretKey.key=k
qq sk-gen-key 'env["FEEDER_SECRET_KEY"]["valueFrom"]["secretKeyRef"] == {"name": "feeder-secret-key", "key": "k"} and "k" in [s for s in kind("Secret") if s["metadata"]["name"] == "feeder-secret-key"][0].get("stringData", {})' "secretKey.key must name the key in the generated Secret too"
# 4. generate: false and no existingSecret: nothing rendered, no env (the Recipe Assistant just stays off).
render sk-off --set secretKey.generate=false
qq sk-off 'not [s for s in kind("Secret") if s["metadata"]["name"].endswith("-secret-key")] and "FEEDER_SECRET_KEY" not in env' "generate=false without existingSecret must render no Secret and no FEEDER_SECRET_KEY"
render sk-off-existing --set secretKey.generate=false --set secretKey.existingSecret=my-key
qq sk-off-existing 'env["FEEDER_SECRET_KEY"]["valueFrom"]["secretKeyRef"]["name"] == "my-key"' "generate=false with existingSecret still uses it"
# release-name based names
helm template myrel "$CHART" "${BASE[@]}" >"$OUT/rel.yaml" 2>/dev/null
grep -q 'name: myrel-feeder-secret-key' "$OUT/rel.yaml" && ok || bad "the generated Secret is named <fullname>-secret-key"
# Upgrading from 1.0.0-dev with --reuse-values reuses the OLD computed values, which have no secretKey: templates must not
# dereference .Values.secretKey directly (nil pointer); only the helper in _helpers.tpl may, defaulting to an empty map.
if grep -n '\.Values\.secretKey' "$CHART"/templates/*.yaml "$CHART"/templates/NOTES.txt 2>/dev/null | grep -q .; then bad "templates must read secretKey through a nil-safe helper in _helpers.tpl, not .Values.secretKey (breaks --reuse-values upgrades from 1.0.0-dev)"; else ok; fi
grep -Eq 'secretKey[^}]*default[[:space:]]+(dict|\(dict)|default[[:space:]]+(dict|\(dict)[^}]*secretKey' "$CHART/templates/_helpers.tpl" && ok || bad "_helpers.tpl must default .Values.secretKey to an empty dict"
# 5. never in plain values: no inline field, no env/extraEnv smuggling, schema rejects unknown secretKey.* fields.
python3 - "$CHART/values.yaml" <<'PY' && ok || bad "values.yaml must declare secretKey with generate, existingSecret, key and no inline value"
import sys, yaml
v = yaml.safe_load(open(sys.argv[1])).get("secretKey")
ok = isinstance(v, dict) and v.get("generate") is True and v.get("existingSecret") == "" and v.get("key") == "secret-key" and set(v) == {"generate", "existingSecret", "key"}
sys.exit(0 if ok else 1)
PY
neg sk-inline "secretKey.value (an inline key) must be rejected by the schema" "${BASE[@]}" --set secretKey.value=AAAA
neg sk-unknown "an unknown secretKey.* field must be rejected by the schema" "${BASE[@]}" --set secretKey.foo=bar
neg sk-type "secretKey.generate must be a boolean" "${BASE[@]}" --set-string secretKey.generate=yes
neg sk-env "env.FEEDER_SECRET_KEY must be refused: use secretKey.existingSecret" "${BASE[@]}" --set env.FEEDER_SECRET_KEY=AAAA
neg sk-extraenv "an extraEnv FEEDER_SECRET_KEY with a plain value must be refused" "${BASE[@]}" --set 'extraEnv[0].name=FEEDER_SECRET_KEY' --set 'extraEnv[0].value=AAAA'
grep -Eq '"secretKey"' "$CHART/values.schema.json" && ok || bad "values.schema.json must declare secretKey"
# docs: chart README and NOTES
RD="$CHART/README.md"; NT="$CHART/templates/NOTES.txt"
for t in 'secretKey\.generate' 'secretKey\.existingSecret' 'secretKey\.key' 'helm\.sh/resource-policy' 'lookup' 'helm template' 'Argo' 'openssl rand -base64 32' 'FEEDER_SECRET_KEY'; do
  grep -Eq -- "$t" "$RD" && ok || bad "chart README must mention $t"
done
grep -Eqi 're-?enter[^.]*API key' "$RD" && ok || bad "chart README must say losing or changing the key means re-entering the API key"
grep -Eqi 'no [^.]*previous|_PREVIOUS' "$RD" && ok || bad "chart README must say there is no previous-key setting for rotation"
grep -Eqi 'secretKey\.key[^.]*(new|generat)[^.]*key|(new|generat)[^.]*key[^.]*secretKey\.key' "$RD" && ok || bad "chart README must say changing secretKey.key on an existing install generates a new key"
grep -Eq 'client `--dry-run`' "$RD" && ok || bad "chart README must say client --dry-run (a server-side dry run can lookup)"
grep -Eq 'the template refuses' "$RD" && ok || bad "chart README must say the template (not the schema) refuses env.FEEDER_SECRET_KEY and a plain extraEnv entry"
grep -Eq 'randBytes' "$CHART/templates/secret-key.yaml" && ! grep -Eq '^[[:space:]]*# randBytes' "$CHART/templates/secret-key.yaml" && ok || bad "the randBytes comment must be a template comment, not a YAML comment"
grep -Eq 'rollout restart' "$RD" && ok || bad "chart README must show rollout restart for rotation"
grep -Eq '`secretKey\.(generate|existingSecret|key)`' "$RD" && ok || bad "chart README values table must list the secretKey.* keys"
grep -Eq '50m' "$RD" && ok || bad "chart README must say proxy-body-size is 50m for photo reads"
grep -qi 'secret' "$NT" && grep -Eqi 'existingSecret|Argo|helm template' "$NT" && ok || bad "NOTES.txt must say where the secret key comes from and repeat the GitOps caveat"
# NOTES must never print the key. `helm install --dry-run=client` would need a cluster, so render NOTES.txt offline: a temporary
# chart copy gets a template that runs `tpl` over a copy of NOTES.txt and puts the text in a ConfigMap, next to the real Secret.
NCH="$OUT/notes-chart"
cp -r "$CHART" "$NCH" && cp "$CHART/templates/NOTES.txt" "$NCH/notes-src.txt"
cat >"$NCH/templates/zz-notes-render.yaml" <<'TPL'
apiVersion: v1
kind: ConfigMap
metadata:
  name: notes-render
data:
  notes: {{ tpl (.Files.Get "notes-src.txt") . | quote }}
TPL
if helm template feeder "$NCH" "${BASE[@]}" >"$OUT/notes-render.yaml" 2>"$OUT/notes-render.err"; then ok; else bad "NOTES offline render failed: $(head -c 300 "$OUT/notes-render.err")"; : >"$OUT/notes-render.yaml"; fi
OUTFILE="$OUT/notes-render.yaml" python3 - <<'PY' && ok || bad "NOTES.txt must render and must never print the secret key (an empty key or empty NOTES counts as a failure)"
import os, sys, yaml
docs = [d for d in yaml.safe_load_all(open(os.environ["OUTFILE"])) if d]
sec = [d for d in docs if d.get("kind") == "Secret" and d["metadata"]["name"] == "feeder-secret-key"]
cm = [d for d in docs if d.get("kind") == "ConfigMap" and d["metadata"]["name"] == "notes-render"]
if not sec or not cm: sys.exit(1)
key = sec[0].get("stringData", {}).get("secret-key", "")
notes = cm[0]["data"]["notes"]
if not key or len(key) < 32 or not notes.strip() or "Recipe Assistant" not in notes: sys.exit(1)
sys.exit(1 if key in notes else 0)
PY
# An extraEnv FEEDER_SECRET_KEY with valueFrom replaces the generated env entry (one entry only) and the chart then makes no Secret.
render sk-extra-from --set 'extraEnv[0].name=FEEDER_SECRET_KEY' --set 'extraEnv[0].valueFrom.secretKeyRef.name=ext-key' --set 'extraEnv[0].valueFrom.secretKeyRef.key=k'
qq sk-extra-from '(lambda es: len(es) == 1 and es[0]["valueFrom"]["secretKeyRef"] == {"name": "ext-key", "key": "k"})([e for e in c["env"] if e["name"] == "FEEDER_SECRET_KEY"]) and not [s for s in kind("Secret") if s["metadata"]["name"].endswith("-secret-key")]' "an extraEnv FEEDER_SECRET_KEY valueFrom must be the only FEEDER_SECRET_KEY entry, with no generated Secret"
# deploy.md env, docker and k8s sections (see also scripts/test/release_test.sh)
for t in 'FEEDER_SECRET_KEY' 'secretKey\.generate' 'secretKey\.existingSecret' 'resource-policy' 'lookup' 'rollout restart' 'client_max_body_size' '50m'; do
  grep -Eq -- "$t" "$DEPLOY_MD" && ok || bad "deploy.md must mention $t"
done
grep -Eqi 'argo' "$DEPLOY_MD" && ok || bad "deploy.md must warn Argo CD / helm template users to set secretKey.existingSecret"
grep -Eqi 're-?enter[^.]*API key' "$DEPLOY_MD" && ok || bad "deploy.md must say rotation or loss means re-entering the API key"

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
