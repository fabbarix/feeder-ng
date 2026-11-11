{{/* Chart name, shortened to the Kubernetes label limit. */}}
{{- define "feeder.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Release name when it already contains the chart name, otherwise release-chart. */}}
{{- define "feeder.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "feeder.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "feeder.selectorLabels" -}}
app.kubernetes.io/name: {{ include "feeder.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "feeder.labels" -}}
helm.sh/chart: {{ include "feeder.chart" . }}
{{ include "feeder.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "feeder.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "feeder.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}

{{/* Secret holding the Google OAuth client: the existing one, or the chart's own. */}}
{{- define "feeder.googleSecretName" -}}
{{- if .Values.google.existingSecret -}}
{{- .Values.google.existingSecret -}}
{{- else -}}
{{- printf "%s-google" (include "feeder.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/* Whether the chart renders Google sign-in env (existing Secret or inline values). */}}
{{- define "feeder.googleEnabled" -}}
{{- if or .Values.google.existingSecret .Values.google.clientId .Values.google.clientSecret -}}true{{- end -}}
{{- end }}

{{- define "feeder.claimName" -}}
{{- default (include "feeder.fullname" .) .Values.persistence.existingClaim -}}
{{- end }}

{{- define "feeder.host" -}}
{{- if .Values.ingress.host -}}
{{- .Values.ingress.host -}}
{{- else -}}
{{- index (urlParse .Values.baseUrl) "host" -}}
{{- end -}}
{{- end }}

{{/*
The secretKey settings as a map: generate, existingSecret, key. The only place that reads .Values.secretKey. It starts from an
empty dict because `helm upgrade --reuse-values` from 1.0.0-dev reuses old computed values that have no secretKey (a nil pointer
otherwise). Old values mean: no generate, no existingSecret, so no key until the user resets values.
*/}}
{{- define "feeder.secretKey" -}}
{{- $sk := .Values.secretKey | default dict -}}
{{- dict "generate" ($sk.generate | default false) "existingSecret" ($sk.existingSecret | default "") "key" ($sk.key | default "secret-key") | toJson -}}
{{- end }}

{{/* "true" when extraEnv already provides FEEDER_SECRET_KEY (valueFrom): then the chart adds neither an env entry nor a Secret. */}}
{{- define "feeder.secretKeyFromExtraEnv" -}}
{{- range .Values.extraEnv | default list -}}
{{- if eq .name "FEEDER_SECRET_KEY" -}}true{{- end -}}
{{- end -}}
{{- end }}

{{/* Name of the Secret holding FEEDER_SECRET_KEY, or empty when there is none. */}}
{{- define "feeder.secretKeySecretName" -}}
{{- $sk := include "feeder.secretKey" . | fromJson -}}
{{- if include "feeder.secretKeyFromExtraEnv" . -}}
{{- else if $sk.existingSecret -}}
{{- $sk.existingSecret -}}
{{- else if $sk.generate -}}
{{- printf "%s-secret-key" (include "feeder.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/* Key inside the Secret holding FEEDER_SECRET_KEY. */}}
{{- define "feeder.secretKeyKey" -}}
{{- (include "feeder.secretKey" . | fromJson).key -}}
{{- end }}

{{/* Fails when FEEDER_SECRET_KEY would be set as a plain value. */}}
{{- define "feeder.secretKeyGuard" -}}
{{- if hasKey (.Values.env | default dict) "FEEDER_SECRET_KEY" -}}
{{- fail "env.FEEDER_SECRET_KEY is not allowed: the key must come from a Secret. Use secretKey.existingSecret (or leave secretKey.generate on)" -}}
{{- end -}}
{{- range .Values.extraEnv | default list -}}
{{- if and (eq .name "FEEDER_SECRET_KEY") (hasKey . "value") -}}
{{- fail "extraEnv FEEDER_SECRET_KEY must use valueFrom, not a plain value: use secretKey.existingSecret" -}}
{{- end -}}
{{- end -}}
{{- end }}
