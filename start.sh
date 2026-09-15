#!/usr/bin/env bash
set -euo pipefail
: "${API_KEY:?Configure API_KEY no ambiente}"
ollama_pid=''
node_pid=''
cleanup() {
  trap - EXIT TERM INT
  [[ -z "$node_pid" ]] || kill "$node_pid" 2>/dev/null || true
  [[ -z "$ollama_pid" ]] || kill "$ollama_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' TERM INT
ollama serve &
ollama_pid=$!
node /app/server.js &
node_pid=$!
# Encerra o container se um dos processos cair; Render pode reiniciá-lo.
set +e
wait -n "$ollama_pid" "$node_pid"
status=$?
set -e
exit "$status"
