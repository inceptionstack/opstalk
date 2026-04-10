#!/usr/bin/env bash
# Install git-secrets hooks and register AWS patterns.
# Runs automatically on `npm install` for contributors.
set -euo pipefail

if ! command -v git-secrets &>/dev/null; then
  echo "⚠️  git-secrets not found — skipping hook install."
  echo "   Install: https://github.com/awslabs/git-secrets#installing-git-secrets"
  exit 0
fi

if [ -d .git ]; then
  git secrets --install -f >/dev/null 2>&1 || true
  git secrets --register-aws >/dev/null 2>&1 || true
  echo "✅ git-secrets hooks installed"
fi
