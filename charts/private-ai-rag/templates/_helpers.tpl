{{/*
Expand the name of the chart.
*/}}
{{- define "private-ai.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "private-ai.fullname" -}}
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

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "private-ai.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "private-ai.labels" -}}
helm.sh/chart: {{ include "private-ai.chart" . }}
{{ include "private-ai.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "private-ai.selectorLabels" -}}
app.kubernetes.io/name: {{ include "private-ai.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "private-ai.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "private-ai.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}


{{/*
Create the CORS origins string
*/}}
{{- define "private-ai.corsOrigins" -}}
{{- $cors := splitList "|" .Values.rag.allowedCorsOrigin }}
{{- range .Values.ingress.additionalHosts }}
  {{- $cors = append $cors (printf "https://%s" .) }}
{{- end }}
{{- join "|" $cors }}
{{- end }}

{{/*
Create docker image name
*/}}
{{- define "private-ai.image" -}}
  {{- $repo := index .Values "open-webui" "image" "repository" -}}
  {{- $tag  := default .Chart.AppVersion (index .Values "open-webui" "image" "tag") -}}
  {{- /* remove all characters through the last slash */ -}}
  {{- $name := regexReplaceAll "^.*/" $repo "" -}}
  {{- printf "%s:%s" $name $tag | quote -}}
{{- end }}
