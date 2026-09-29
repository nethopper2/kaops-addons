{{/*
Common labels for the resources this chart templates itself (the vendored
upstream manifest keeps its own labels untouched).
*/}}
{{- define "agent-sandbox.labels" -}}
app.kubernetes.io/part-of: agent-sandbox
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end }}
