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
qq defaults '"FEEDER_GOOGLE_CLIENT_ID" not in env and not kind("Secret")' "no Google env and no Secret by default"
qq defaults 'len(kind("PersistentVolumeClaim")) == 1 and kind("PersistentVolumeClaim")[0]["spec"]["accessModes"] == ["ReadWriteOnce"] and kind("PersistentVolumeClaim")[0]["spec"]["resources"]["requests"]["storage"] == "1Gi"' "a 1Gi RWO PVC by default"
qq defaults 'len(kind("Service")) == 1 and not kind("Ingress")' "a Service and no Ingress by default"
qq defaults 'any(p["containerPort"] == 8080 and p["name"] == "http" for p in c["ports"])' "container port http 8080"
qq defaults 'len(kind("ServiceAccount")) == 1 and pod["serviceAccountName"]' "a ServiceAccount"

# --- image tag override, extra env ---
render tag --set image.tag=9.9.9 --set env.FEEDER_ADDR=:9090 \
  --set 'extraEnv[0].name=TZ' --set 'extraEnv[0].value=Europe/Rome'
qq tag 'c["image"] == "ghcr.io/fabbarix/feeder-ng:9.9.9"' "image.tag must override the appVersion"
qq tag 'env["FEEDER_ADDR"]["value"] == ":9090" and env["TZ"]["value"] == "Europe/Rome"' "env and extraEnv must be rendered"

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

# --- google.existingSecret ---
render existing-secret --set google.existingSecret=my-google
qq existing-secret 'env["FEEDER_GOOGLE_CLIENT_ID"]["valueFrom"]["secretKeyRef"] == {"name": "my-google", "key": "client-id"} and env["FEEDER_GOOGLE_CLIENT_SECRET"]["valueFrom"]["secretKeyRef"] == {"name": "my-google", "key": "client-secret"}' "Google env must reference the existing Secret with the default keys"
qq existing-secret 'not kind("Secret")' "no Secret may be created when google.existingSecret is set"
render existing-secret-keys --set google.existingSecret=my-google --set google.clientIdKey=id --set google.clientSecretKey=sec
qq existing-secret-keys 'env["FEEDER_GOOGLE_CLIENT_ID"]["valueFrom"]["secretKeyRef"]["key"] == "id" and env["FEEDER_GOOGLE_CLIENT_SECRET"]["valueFrom"]["secretKeyRef"]["key"] == "sec"' "configurable Secret keys"

# --- inline Google values -> chart-created Secret ---
render inline-google --set google.clientId=cid-123 --set google.clientSecret=csec-456
qq inline-google 'len(kind("Secret")) == 1 and kind("Secret")[0]["metadata"]["name"] == "feeder-google"' "a Secret feeder-google must be created for inline values"
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

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
