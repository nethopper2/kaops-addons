#!/usr/bin/env bash
#
# vendor-openreplay.sh
#
# OpenReplay does NOT publish a Helm registry. We vendor their two upstream
# Helm charts (databases + openreplay, both under scripts/helmcharts/ in
# github.com/openreplay/openreplay) into this repo at commit time.
#
# This script copies those charts from a local clone of openreplay/openreplay
# into charts/openreplay/charts/{databases,openreplay}/. Run it once at addon
# bring-up, and again on every upstream version bump.
#
# The .gitignore has carve-outs for charts/openreplay/charts/{databases,openreplay}
# so the vendored sources ARE committed (unlike other addons' subcharts).
#
# Tag selection: pulled from charts/openreplay/Chart.yaml `appVersion` (e.g.
# "v1.26.0"), or override via the first positional arg or OPENREPLAY_TAG env.
#
# Environment:
#   OPENREPLAY_DIR (optional) - Path to local openreplay/openreplay checkout
#                               (default: ../openreplay, relative to repo root)
#   OPENREPLAY_TAG (optional) - Override tag selection (skips Chart.yaml read)
#
# Usage:
#   ./scripts/vendor-openreplay.sh             # use appVersion from Chart.yaml
#   ./scripts/vendor-openreplay.sh v1.26.0     # explicit tag
#   OPENREPLAY_DIR=/path/to/openreplay ./scripts/vendor-openreplay.sh
#
set -euo pipefail

CHART_DIR="charts/openreplay"
CHART_YAML="${CHART_DIR}/Chart.yaml"
OPENREPLAY_DIR="${OPENREPLAY_DIR:-../openreplay}"
DEST_DATABASES="${CHART_DIR}/charts/databases"
DEST_OPENREPLAY="${CHART_DIR}/charts/openreplay"

# --- Resolve tag ---
if [[ -n "${1:-}" ]]; then
  TAG="$1"
elif [[ -n "${OPENREPLAY_TAG:-}" ]]; then
  TAG="$OPENREPLAY_TAG"
elif [[ -f "$CHART_YAML" ]]; then
  TAG=$(grep '^appVersion:' "$CHART_YAML" | awk '{print $2}' | tr -d '"' | tr -d "'")
  if [[ -z "$TAG" ]]; then
    echo "ERROR: Could not parse appVersion from ${CHART_YAML}"
    exit 1
  fi
else
  echo "ERROR: ${CHART_YAML} not found and no tag arg provided"
  exit 1
fi

echo "Target OpenReplay tag: ${TAG}"

# --- Validate sibling clone ---
if [[ ! -d "$OPENREPLAY_DIR/.git" ]]; then
  cat <<EOF
ERROR: openreplay/openreplay clone not found at ${OPENREPLAY_DIR}

  Clone it as a sibling of this repo:
    git clone https://github.com/openreplay/openreplay.git ${OPENREPLAY_DIR}

  Or set OPENREPLAY_DIR to an existing checkout.
EOF
  exit 1
fi

SRC_DATABASES="${OPENREPLAY_DIR}/scripts/helmcharts/databases"
SRC_OPENREPLAY="${OPENREPLAY_DIR}/scripts/helmcharts/openreplay"

# --- Fetch and check out tag ---
echo "Fetching tags in ${OPENREPLAY_DIR}..."
git -C "$OPENREPLAY_DIR" fetch --tags --quiet origin
git -C "$OPENREPLAY_DIR" checkout --quiet "$TAG"

if [[ ! -d "$SRC_DATABASES" || ! -d "$SRC_OPENREPLAY" ]]; then
  echo "ERROR: Expected upstream chart dirs not found:"
  echo "  ${SRC_DATABASES}"
  echo "  ${SRC_OPENREPLAY}"
  exit 1
fi

# --- Copy ---
# IMPORTANT: cp -R preserves the .tgz blobs that upstream bundles inside its
# subcharts' charts/ dirs. Do NOT run `helm dep update` against the copied
# trees afterwards — that would try to re-resolve subchart versions against
# repos that may no longer exist (e.g. removed bitnami chart versions).
echo "Removing previous vendored sources..."
rm -rf "$DEST_DATABASES" "$DEST_OPENREPLAY"

echo "Copying ${SRC_DATABASES} -> ${DEST_DATABASES}"
mkdir -p "$(dirname "$DEST_DATABASES")"
cp -R "$SRC_DATABASES" "$DEST_DATABASES"

echo "Copying ${SRC_OPENREPLAY} -> ${DEST_OPENREPLAY}"
cp -R "$SRC_OPENREPLAY" "$DEST_OPENREPLAY"

# --- Report subchart versions for the umbrella's Chart.yaml ---
DB_VER=$(grep '^version:' "${DEST_DATABASES}/Chart.yaml" | awk '{print $2}' | tr -d '"' | tr -d "'")
OR_VER=$(grep '^version:' "${DEST_OPENREPLAY}/Chart.yaml" | awk '{print $2}' | tr -d '"' | tr -d "'")

cat <<EOF

Vendored OpenReplay@${TAG} successfully.

Subchart versions to verify in ${CHART_YAML} dependencies:
  databases:  ${DB_VER}
  openreplay: ${OR_VER}

Next steps:
  1. Confirm Chart.yaml dependencies[].version matches the above.
  2. cd ${CHART_DIR} && helm lint .
  3. helm template . -f test-values.yaml   # see README for a starter test-values.yaml
EOF
