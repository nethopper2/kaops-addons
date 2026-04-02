#!/usr/bin/env bash
#
# copy-pipelines.sh
#
# Copies pipeline .py files from a local checkout of nethopper2/nh-rag-embedding
# into charts/private-ai-rag/pipelines/ for inclusion in the Helm chart package.
#
# Branch selection based on chart version in Chart.yaml:
#   *-alpha*  → dev branch
#   *-beta*   → stage branch
#   otherwise → main branch
#
# In CI, the checkout and branch selection is handled by the GitHub Actions workflow.
# This script is primarily for local development and testing.
#
# Environment variables:
#   NH_RAG_EMBEDDING_DIR (optional) - Path to local nh-rag-embedding checkout
#                                     (default: ../nh-rag-embedding, relative to repo root)
#   CHART_DIR (optional) - Path to chart directory (default: charts/private-ai-rag)
#   PIPELINES_BRANCH (optional) - Override branch selection (skips auto-detection)
#
# Usage:
#   ./scripts/copy-pipelines.sh
#   NH_RAG_EMBEDDING_DIR=/path/to/nh-rag-embedding ./scripts/copy-pipelines.sh
#
set -euo pipefail

CHART_DIR="${CHART_DIR:-charts/private-ai-rag}"
NH_RAG_EMBEDDING_DIR="${NH_RAG_EMBEDDING_DIR:-../nh-rag-embedding}"
PIPELINES_SRC_DIR="${NH_RAG_EMBEDDING_DIR}/pipelines"
PIPELINES_DEST_DIR="${CHART_DIR}/pipelines"

# --- Resolve chart version ---
CHART_YAML="${CHART_DIR}/Chart.yaml"
if [[ ! -f "$CHART_YAML" ]]; then
  echo "ERROR: Chart.yaml not found at ${CHART_YAML}"
  exit 1
fi

CHART_VERSION=$(grep '^version:' "$CHART_YAML" | awk '{print $2}' | tr -d '"' | tr -d "'")
if [[ -z "$CHART_VERSION" ]]; then
  echo "ERROR: Could not parse version from ${CHART_YAML}"
  exit 1
fi

echo "Chart version: ${CHART_VERSION}"

# --- Determine expected branch from chart version ---
if [[ -n "${PIPELINES_BRANCH:-}" ]]; then
  EXPECTED_BRANCH="$PIPELINES_BRANCH"
  echo "Using override branch: ${EXPECTED_BRANCH}"
elif [[ "$CHART_VERSION" == *-alpha* ]]; then
  EXPECTED_BRANCH="dev"
elif [[ "$CHART_VERSION" == *-beta* ]]; then
  EXPECTED_BRANCH="stage"
else
  EXPECTED_BRANCH="main"
fi

echo "Expected source branch: ${EXPECTED_BRANCH}"

# --- Validate local repo and switch branch ---
if [[ ! -d "$NH_RAG_EMBEDDING_DIR/.git" ]]; then
  echo "ERROR: nh-rag-embedding repo not found at ${NH_RAG_EMBEDDING_DIR}"
  echo "  Clone it: git clone https://github.com/nethopper2/nh-rag-embedding.git ${NH_RAG_EMBEDDING_DIR}"
  exit 1
fi

CURRENT_BRANCH=$(git -C "$NH_RAG_EMBEDDING_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [[ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "Switching nh-rag-embedding from '${CURRENT_BRANCH}' to '${EXPECTED_BRANCH}'..."
  git -C "$NH_RAG_EMBEDDING_DIR" fetch origin "$EXPECTED_BRANCH" --quiet
  git -C "$NH_RAG_EMBEDDING_DIR" checkout "$EXPECTED_BRANCH" --quiet
  git -C "$NH_RAG_EMBEDDING_DIR" pull origin "$EXPECTED_BRANCH" --quiet
fi

echo "Source: ${NH_RAG_EMBEDDING_DIR} (branch: ${EXPECTED_BRANCH})"

# --- Copy pipeline files ---
if [[ ! -d "$PIPELINES_SRC_DIR" ]]; then
  echo "ERROR: Pipelines directory not found at ${PIPELINES_SRC_DIR}"
  exit 1
fi

PY_FILES=$(find "$PIPELINES_SRC_DIR" -maxdepth 1 -name "*.py" -type f)
if [[ -z "$PY_FILES" ]]; then
  echo "WARNING: No .py files found in ${PIPELINES_SRC_DIR}"
  exit 0
fi

mkdir -p "$PIPELINES_DEST_DIR"

echo "Copying pipeline files to ${PIPELINES_DEST_DIR}:"
for f in $PY_FILES; do
  FILENAME=$(basename "$f")
  cp "$f" "${PIPELINES_DEST_DIR}/${FILENAME}"
  echo "  ✓ ${FILENAME}"
done

TOTAL=$(echo "$PY_FILES" | wc -l | tr -d ' ')
echo ""
echo "Done! Copied ${TOTAL} pipeline file(s) from nh-rag-embedding@${EXPECTED_BRANCH} → ${PIPELINES_DEST_DIR}"
