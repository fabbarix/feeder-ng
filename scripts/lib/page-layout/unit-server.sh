#!/usr/bin/env bash
# fast-checks (the parallel guard): one worker's server, restarted before every unit on a fresh copy of the seeded database, so no
# unit sees another unit's writes. Called by the driver (--reset) and by scripts/check-page-layout.sh (stop, on every exit path).
#   unit-server.sh restart WORKDIR PORT     stop this worker's server, copy the snapshot to WORKDIR/data, start it, wait until it answers
#   unit-server.sh stop WORKDIR             stop the server WORKDIR/server.pid names (its own session and process group)
# The wrapper exports what every worker shares: PL_SERVER_CMD (the server command), PL_SNAPSHOT (the seeded data dir, copied once
# per unit), PL_SECRET_KEY (the seed's FEEDER_SECRET_KEY: the Recipe Assistant's key is sealed with it), PL_TEST_NOW (the probe
# servers' FEEDER_TEST_NOW) and PL_ADMIN (FEEDER_ADMIN_EMAIL).
set -uo pipefail
cmd="${1:-}"
dir="${2:-}"
[ -n "$cmd" ] && [ -n "$dir" ] || { echo "usage: unit-server.sh restart WORKDIR PORT | stop WORKDIR" >&2; exit 2; }
pidfile="$dir/server.pid"

stop() {
  [ -s "$pidfile" ] || return 0
  local pid
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    for _ in $(seq 1 50); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.05
    done
    kill -0 "$pid" 2>/dev/null && { kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null; }
  fi
  rm -f "$pidfile"
}

case "$cmd" in
  stop)
    stop
    exit 0
    ;;
  restart)
    port="${3:-}"
    [ -n "$port" ] || { echo "unit-server.sh: restart needs a PORT" >&2; exit 2; }
    stop
    rm -rf "$dir/data"
    mkdir -p "$dir"
    cp -a "$PL_SNAPSHOT" "$dir/data" || { echo "unit-server.sh: cannot copy the snapshot $PL_SNAPSHOT" >&2; exit 1; }
    # A port another process holds for a moment (bind: address already in use) is tried again, up to five times.
    for attempt in 1 2 3 4 5; do
      FEEDER_SECRET_KEY="$PL_SECRET_KEY" FEEDER_TEST_NOW="$PL_TEST_NOW" FEEDER_DEV_LOGIN=1 FEEDER_ADMIN_EMAIL="$PL_ADMIN" \
        FEEDER_DATA_DIR="$dir/data" FEEDER_ADDR="127.0.0.1:$port" PORT="$port" \
        setsid nohup bash -c 'echo $$ >"$1"; shift; exec '"$PL_SERVER_CMD" _ "$pidfile" >>"$dir/server.log" 2>&1 </dev/null 8>&- 9>&- &
      for _ in $(seq 1 300); do
        curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$port/api/health" 2>/dev/null && exit 0
        [ -s "$pidfile" ] && ! kill -0 "$(cat "$pidfile")" 2>/dev/null && break
        sleep 0.05
      done
      stop
      tail -n 1 "$dir/server.log" | grep -q 'address already in use' || break
      sleep 0.3
    done
    echo "unit-server.sh: the server on port $port did not start (see $dir/server.log)" >&2
    stop
    exit 1
    ;;
  *)
    echo "usage: unit-server.sh restart WORKDIR PORT | stop WORKDIR" >&2
    exit 2
    ;;
esac
