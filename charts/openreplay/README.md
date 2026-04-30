# openreplay

KAOPS addon that installs [OpenReplay](https://openreplay.com/) (open-source session replay) onto a target cluster. Bundles upstream's `databases` and `openreplay` Helm charts (vendored from `github.com/openreplay/openreplay/scripts/helmcharts/`) into a single umbrella chart driven by the standard KAOPS `config.yaml` install form.

## v1 scope

- All databases (postgresql, redis, clickhouse, kafka, minio, vault) bundled and enabled by default.
- All DB passwords and JWT secrets created at install time by an idempotent bootstrap Job (`templates/bootstrap-secret-job.yaml`) that runs as a Helm `pre-install,pre-upgrade` and ArgoCD `PreSync` hook.
- Single user input: `adminEmail`. Domain is system-injected as `openreplay.${system.cluster.name}.${system.hubCluster.ingressHostname}`.
- **No bundled ingress controller or cert-manager.** OpenReplay only creates Ingress resources — the cluster must already have NGINX Ingress Controller and Cert-Manager installed (via the `ingress-warden` addon). Upstream's bundled `ingress-nginx` subchart is disabled via `openreplay.ingress-nginx.enabled: false`.
- OpenReplay's onboarding model: **the first user to sign up becomes admin** — no admin seed job.

Deferred to v2: external Postgres / ClickHouse / S3, SSO via oauth2-proxy, sealed-secrets for user-supplied creds, ServiceMonitor + Grafana dashboard, multi-node RWX overrides.

## Vendored upstream sources

`charts/databases/` and `charts/openreplay/` are committed copies of upstream OpenReplay Helm charts at the tag matching `Chart.yaml` `appVersion`. The repo's `.gitignore` carves these paths out of the global `charts/*/charts/*` rule.

To refresh after an upstream version bump:

```bash
# from repo root, with a sibling clone at ../openreplay
./scripts/vendor-openreplay.sh                # uses appVersion from Chart.yaml
./scripts/vendor-openreplay.sh v1.27.0        # explicit tag
```

The script prints the upstream subchart `version:` strings — paste them into `Chart.yaml` `dependencies[].version` if they changed.

## Local development

From this directory:

```bash
helm dependency update            # no-op when subcharts are physically vendored, but verifies Chart.lock
helm lint .
helm template . -f test-values.yaml
```

A minimal `test-values.yaml` for local renders (gitignored):

```yaml
global:
  domainName: openreplay.test.example.com
openreplay:
  global:
    domainName: openreplay.test.example.com
  ingress:
    hosts:
      - host: openreplay.test.example.com
    tls:
      - hosts: [openreplay.test.example.com]
        secretName: openreplay-tls
  adminEmail: admin@example.com
```

## Operational notes

**Secrets and rotation.** `templates/bootstrap-secret-job.yaml` runs a short-lived Job (as both a Helm `pre-install,pre-upgrade` hook and an ArgoCD `PreSync` hook) that creates `openreplay-shared-secrets` only if it doesn't already exist. The Secret is **never reconciled** by Helm or ArgoCD after creation — it lives in the cluster as cluster state, not chart state. Upstream's `openreplay.secrets` helper resolves to it via the `existingSecret` refs set on `global.{postgresql,clickhouse,s3,orAppSecrets}` in `values.yaml`, so upstream's own `or-secrets` Secret is suppressed.

To rotate credentials:

```bash
kubectl -n <namespace> delete secret openreplay-shared-secrets
argocd app sync <app>            # or: helm upgrade
# Restart consumers so they pick up new values:
kubectl -n <namespace> rollout restart statefulset --all
kubectl -n <namespace> rollout restart deployment --all
```

The next sync re-runs the bootstrap Job, sees the Secret missing, and generates fresh values. Helm uninstall does **not** remove the Secret (it's not Helm-managed) — `kubectl delete secret openreplay-shared-secrets` to clean up after a tear-down if you don't want orphan creds.

The bootstrap Job runs with a dedicated ServiceAccount + namespaced Role limited to `secrets/get,create` on a single resource name, all created and torn down in lockstep with the Job (`HookSucceeded,BeforeHookCreation` delete policy, `sync-wave -5` for RBAC, `sync-wave 0` for the Job). Image and resources are tunable via `bootstrap.image` / `bootstrap.resources` in `values.yaml`.

**Ingress and TLS.** Per-app subcharts (api, assist, chalice, frontend, http, integrations, spot) each render their own `Ingress` resource. They all use `ingressClassName` resolved from `global.ingress.controller.ingressClassResource.name` (set to `nginx` in `values.yaml`); upstream's `frontend/ingress-master.yaml` hardcodes `cert-manager.io/cluster-issuer: letsencrypt-prod` and a TLS `secretName` of `openreplay-ssl`. Both names match what the `ingress-warden` addon installs. If your cluster uses different names, override `global.ingress.controller.ingressClassResource.name` and patch the per-subchart `ingress.tls.secretName` in `values.yaml`. Cert-manager will issue one cert per Ingress's distinct `secretName`.

**First-install timing.** Upstream OpenReplay does not gate the app pods on database readiness. On a clean install, the OpenReplay app pods will `CrashLoopBackoff` for ~3-5 minutes while postgres/redis/clickhouse/kafka StatefulSets come up and the `databases-migrate` Job completes. Kubernetes restart backoff handles this; ArgoCD marks the release Healthy after self-heal. This is expected.

**Bumping the OpenReplay version.** Update `appVersion` in `Chart.yaml`, run `../../scripts/vendor-openreplay.sh`, paste the new subchart versions into `Chart.yaml` `dependencies` if they changed, bump `version` (e.g. `0.1.0-alpha.1` → `0.1.0-alpha.2`), commit. The release workflow handles packaging and publishing.

**Verification of upstream value mappings.** After vendoring, read `charts/databases/values.yaml` and `charts/openreplay/values.yaml` to confirm the credential reference paths (e.g. `postgresql.auth.existingSecret` vs `postgresqlPassword`) match what `values.yaml` and the bootstrap Job set up. Upstream's `vars.yaml` uses literal `{{ randAlphaNum 20 }}` strings expecting external preprocessing — our umbrella supplants that by materializing the Secret out-of-band via the bootstrap Job.
