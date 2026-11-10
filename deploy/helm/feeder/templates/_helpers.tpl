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
