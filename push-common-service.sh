#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# push-common-service.sh
# Run this script from inside the common-service folder to push to GitHub.
# The git repo is already initialized and committed — just needs the push.
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo "→ Pushing common-service to GitHub..."
echo ""

# If the remote repo already has commits (not empty), pull first
git pull origin main --allow-unrelated-histories --no-edit 2>/dev/null || true

# Push
git push -u origin main

echo ""
echo "✓ common-service pushed successfully!"
echo "  View at: https://github.com/sushmano-digivista/Chaturbhujaplots-SalesTool-BE-CommonServices"
