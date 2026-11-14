#!/usr/bin/env bash
#
# Start, stop and inspect the two local e2e dev servers.
#
# The point of this script is the database, not the servers: e2e may only run
# against 127.0.0.1:5433/colina_test, and every dev server must prove that is
# where it is connected before Playwright will execute a test body. `start`
# validates the throwaway database URL, launches both apps with that URL and
# E2E_EXPOSE_DB=1, then checks the gated `x-e2e-db` response header on both.
#
# The real database (localhost:5432/colina) is never touched.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="${TMPDIR:-/tmp}/colina-e2e"
WEB_URL="http://localhost:3000/en"
ADMIN_URL="http://localhost:3001/en/login"
WEB_PORT=3000
ADMIN_PORT=3001
READY_TIMEOUT_SECONDS=180

usage() {
  echo "Usage: $(basename "$0") {start|stop|status}" >&2
}

# Mirrors e2e/db-fixture.ts assertTestDatabase: local host, port 5433,
# database colina_test. Never prints credentials.
is_test_identity() {
  [[ "$1" == "127.0.0.1:5433/colina_test" ||
    "$1" == "localhost:5433/colina_test" ]]
}

# URL -> host:port/dbname, or "unknown" for a malformed URL. No credentials.
db_identity() {
  node -e '
    try {
      const url = new URL(process.argv[1]);
      const database = url.pathname.replace(/^\/+/, "");
      process.stdout.write(`${url.hostname}:${url.port}/${database}`);
    } catch {
      process.stdout.write("unknown");
    }
  ' "$1"
}

assert_test_database_url() {
  local name="$1" value="$2" identity
  if [[ -z "$value" ]]; then
    echo "REFUSING: $name is not set in $DBURL_FILE." >&2
    return 1
  fi

  identity="$(db_identity "$value")"
  if ! is_test_identity "$identity"; then
    echo "REFUSING: $name points to ${identity}, not 127.0.0.1:5433/colina_test." >&2
    return 1
  fi
}

port_busy() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null
}

header_value() {
  local url="$1" headers
  if ! headers="$(curl --noproxy '*' -fsS -D - -o /dev/null --max-time 10 "$url" 2>/dev/null)"; then
    return 1
  fi
  printf '%s\n' "$headers" |
    tr -d '\r' |
    awk -F': ' 'tolower($1) == "x-e2e-db" { print $2; exit }'
}

status_command() {
  local failed=0 pair name url value

  for pair in "web|$WEB_URL" "admin|$ADMIN_URL"; do
    name="${pair%%|*}"
    url="${pair#*|}"

    if ! value="$(header_value "$url")"; then
      printf '%-5s GET %-33s x-e2e-db: <no response>\n' "$name" "$url"
      echo "status FAILED: $name at $url did not answer. Start the servers with: scripts/e2e-servers.sh start" >&2
      failed=1
      continue
    fi

    printf '%-5s GET %-33s x-e2e-db: %s\n' "$name" "$url" "${value:-<missing>}"

    if [[ -z "$value" ]]; then
      echo "status FAILED: $name did not send x-e2e-db. It was started without E2E_EXPOSE_DB=1 (or is not this app); start it with: scripts/e2e-servers.sh start" >&2
      failed=1
    elif ! is_test_identity "$value"; then
      echo "status FAILED: $name reports x-e2e-db \"$value\", not the test target 127.0.0.1:5433/colina_test (or localhost:5433/colina_test)." >&2
      failed=1
    fi
  done

  if ((failed != 0)); then
    return 1
  fi

  echo "status: both servers prove the test database."
}

wait_for_pid_file() {
  local pid_file="$1" _
  for _ in {1..100}; do
    [[ -s "$pid_file" ]] && return 0
    sleep 0.1
  done
  return 1
}

wait_for_http() {
  local url="$1" deadline="$2"
  while ((SECONDS < deadline)); do
    if curl --noproxy '*' -fsS -o /dev/null --max-time 3 "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

launch_server() {
  local name="$1"
  local npm_script="$2"
  local pid_file="$PID_DIR/$name.pid"
  local log_file="$PID_DIR/$name.log"

  # All server-relevant values are exported explicitly in this same command so
  # the app-specific .env.local (which names the REAL database) cannot win.
  # setsid detaches the server into its own process group; the shell records
  # that group's id before exec'ing npm, which is what `stop` kills.
  DATABASE_URL="$DATABASE_URL" \
    DIRECT_URL="$DIRECT_URL" \
    NEXTAUTH_SECRET="local-dev-only-not-a-real-secret" \
    NEXT_PUBLIC_WEB_URL="http://localhost:3000" \
    NEXTAUTH_URL="http://localhost:3001" \
    E2E_EXPOSE_DB=1 \
    setsid --fork bash -c 'echo $$ > "$1"; exec npm run "$2"' _ \
    "$pid_file" "$npm_script" >>"$log_file" 2>&1

  if ! wait_for_pid_file "$pid_file"; then
    echo "start FAILED: $name did not write $pid_file. Log: $log_file" >&2
    tail -n 20 "$log_file" >&2 || true
    return 1
  fi

  echo "$name: started (pid group $(cat "$pid_file"), log $log_file)"
}

stop_one() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  local pid _
  if [[ ! -f "$pid_file" ]]; then
    echo "$name: no pid file ($pid_file); not started by this script."
    return 0
  fi

  pid="$(cat "$pid_file")"
  if [[ ! "$pid" =~ ^[0-9]+$ ]] || ((pid <= 1)); then
    echo "$name: invalid pid file ($pid_file contains \"$pid\"); removing it without killing anything." >&2
    rm -f "$pid_file"
    return 0
  fi

  if kill -0 -- "-$pid" 2>/dev/null; then
    echo "$name: stopping process group $pid"
    kill -TERM -- "-$pid" 2>/dev/null || true
    for _ in {1..100}; do
      kill -0 -- "-$pid" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 -- "-$pid" 2>/dev/null; then
      echo "$name: process group $pid ignored TERM; sending KILL" >&2
      kill -KILL -- "-$pid" 2>/dev/null || true
    fi
  else
    echo "$name: process group $pid is no longer running."
  fi

  rm -f "$pid_file"
}

stop_command() {
  stop_one web
  stop_one admin
}

start_command() {
  local env_file identity port pid_file

  if [[ -f "$HOME/.colina/dburl.sh" ]]; then
    DBURL_FILE="$HOME/.colina/dburl.sh"
  elif [[ -f /tmp/opencode/dburl.sh ]]; then
    DBURL_FILE="/tmp/opencode/dburl.sh"
  else
    echo "REFUSING: no test database env file. Expected $HOME/.colina/dburl.sh (fallback /tmp/opencode/dburl.sh)." >&2
    return 1
  fi

  # shellcheck disable=SC1090
  source "$DBURL_FILE"

  echo "Test database env: $DBURL_FILE"
  assert_test_database_url DATABASE_URL "${DATABASE_URL:-}"
  assert_test_database_url DIRECT_URL "${DIRECT_URL:-}"
  identity="$(db_identity "$DATABASE_URL")"
  echo "DATABASE_URL -> $identity"
  echo "DIRECT_URL   -> $(db_identity "$DIRECT_URL")"

  for port in "$WEB_PORT" "$ADMIN_PORT"; do
    if port_busy "$port"; then
      echo "REFUSING: port $port is already in use. Stop that process first; scripts/e2e-servers.sh stop only stops servers this script started." >&2
      return 1
    fi
  done

  mkdir -p "$PID_DIR"
  for pid_file in "$PID_DIR/web.pid" "$PID_DIR/admin.pid"; do
    rm -f "$pid_file"
  done
  : >"$PID_DIR/web.log"
  : >"$PID_DIR/admin.log"

  cd "$REPO_ROOT"
  if ! launch_server web dev:web; then
    stop_one web
    return 1
  fi
  if ! launch_server admin dev:admin; then
    stop_one admin
    stop_one web
    return 1
  fi

  echo "Waiting for both servers (timeout ${READY_TIMEOUT_SECONDS}s)..."
  local deadline=$((SECONDS + READY_TIMEOUT_SECONDS))
  if ! wait_for_http "$WEB_URL" "$deadline"; then
    echo "start FAILED: web did not answer $WEB_URL. Log: $PID_DIR/web.log" >&2
    tail -n 30 "$PID_DIR/web.log" >&2 || true
    stop_command
    return 1
  fi
  if ! wait_for_http "$ADMIN_URL" "$deadline"; then
    echo "start FAILED: admin did not answer $ADMIN_URL. Log: $PID_DIR/admin.log" >&2
    tail -n 30 "$PID_DIR/admin.log" >&2 || true
    stop_command
    return 1
  fi

  status_command
}

case "${1:-}" in
  start)
    start_command
    ;;
  stop)
    stop_command
    ;;
  status)
    status_command
    ;;
  *)
    usage
    exit 2
    ;;
esac
