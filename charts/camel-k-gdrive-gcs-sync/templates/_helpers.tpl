{{/*
Expand the name of the chart.
*/}}
{{- define "camel-k-gdrive-gcs-sync.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}
{{/* Helper functions can be defined here */}}

{{/*
Determine the correct API version for Integrations
*/}}
{{- define "camel-k.integrationApiVersion" -}}
{{- if .Values.apiVersions -}}
{{- if .Values.apiVersions.integration -}}
camel.apache.org/{{ .Values.apiVersions.integration }}
{{- else -}}
camel.apache.org/v1
{{- end -}}
{{- else -}}
camel.apache.org/v1
{{- end -}}
{{- end -}}

{{/*
Global Camel K namespace
*/}}
{{- define "camel-k.namespace" -}}
{{- .Values.camelK.namespace -}}
{{- end -}}
{{/*
Create a default fully qualified app name.
*/}}
{{- define "camel-k-gdrive-gcs-sync.fullname" -}}
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
{{- define "camel-k-gdrive-gcs-sync.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}
