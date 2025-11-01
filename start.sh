#!/usr/bin/env bash
set -e

echo "📦 Starting repository start script..."
# Ensure we run from repo root
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
cd "$SCRIPT_DIR"

# Navigate to backend and install + start
if [ -d "backend" ]; then
  echo "➡️  Changing to backend/"
  cd backend
  echo "⬇️  Installing Node dependencies (npm ci)"
  npm ci --no-audit --no-fund
  echo "▶️  Starting backend (npm start)"
  npm start
else
  echo "❌ backend directory not found. Make sure repository contains a 'backend' folder."
  exit 1
fi
