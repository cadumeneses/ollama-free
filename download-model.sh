#!/usr/bin/env bash
set -euo pipefail
ollama serve &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true' EXIT
ready=0
for i in {1..60}; do
  if ollama list >/dev/null 2>&1; then ready=1; break; fi
  kill -0 "$pid" || exit 1
  sleep 1
done
[[ "$ready" == 1 ]] || exit 1
ollama pull "$MODEL"
