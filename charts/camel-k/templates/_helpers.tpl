{{/*
Expand the name of the chart.
*/}}
{{- define "camel-k.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "camel-k.fullname" -}}
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
{{- define "camel-k.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "camel-k.labels" -}}
helm.sh/chart: {{ include "camel-k.chart" . }}
{{ include "camel-k.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.global.labels }}
{{- toYaml . | nindent 0 }}
{{- end }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "camel-k.selectorLabels" -}}
app.kubernetes.io/name: {{ include "camel-k.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "camel-k.serviceAccountName" -}}
{{- if .Values.camel-k.operator.serviceAccount.create }}
{{- default (include "camel-k.fullname" .) .Values.camel-k.operator.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.camel-k.operator.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Return the proper image name for the operator
*/}}
{{- define "camel-k.operatorImage" -}}
{{- if .Values.camel-k.operator.image }}
{{- if .Values.camel-k.operator.image.repository }}
{{- printf "%s:%s" .Values.camel-k.operator.image.repository (.Values.camel-k.operator.image.tag | default .Chart.AppVersion) }}
{{- else }}
{{- printf "apache/camel-k:%s" (.Values.camel-k.operator.image.tag | default .Chart.AppVersion) }}
{{- end }}
{{- else }}
{{- printf "apache/camel-k:%s" .Chart.AppVersion }}
{{- end }}
{{- end }}

{{/*
Return the proper Docker Image Registry Secret Names
*/}}
{{- define "camel-k.imagePullSecrets" -}}
{{- if .Values.global.imagePullSecrets }}
imagePullSecrets:
{{- range .Values.global.imagePullSecrets }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Get the operator namespace
*/}}
{{- define "camel-k.operatorNamespace" -}}
{{- default .Release.Namespace .Values.camel-k.operator.namespace }}
{{- end }}

{{/*
Get the platform name
*/}}
{{- define "camel-k.platformName" -}}
{{- default (include "camel-k.fullname" .) .Values.camel-k.platform.name }}
{{- end }}
