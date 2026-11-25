#!/bin/sh
# Runs a command while it holds a lock for this computer, so that only one
# process at a time sends Scryfall requests. Use it when several agents work
# at once: each one's browser tests keep the queue's spacing, but two runs
# together would double the request rate from the same IP address.
#
#   scripts/scryfall-lock.sh node scripts/check-ui.mjs
#
# The exit code is the command's. The lock is a directory with the holder's
# process ID in it. A lock whose holder has ended is cleared at once. A lock
# with no process ID is cleared when it is older than
# SCRYFALL_LOCK_STALE_MINUTES (25 by default).
LOCK=${SCRYFALL_LOCK:-/tmp/cascade-scryfall.lock}
STALE=${SCRYFALL_LOCK_STALE_MINUTES:-25}
POLL=${SCRYFALL_LOCK_POLL:-15}
CLEAR="$LOCK.clearing"

if [ "$#" -eq 0 ]; then
  echo "Usage: scripts/scryfall-lock.sh <command> [args...]" >&2
  exit 2
fi

# True when the lock in $LOCK is left from a run that has ended.
is_stale() {
  pid=$(cat "$LOCK/pid" 2>/dev/null)
  if [ -n "$pid" ]; then
    ! kill -0 "$pid" 2>/dev/null
  else
    [ -n "$(find "$LOCK" -maxdepth 0 -mmin +"$STALE" 2>/dev/null)" ]
  fi
}

waited=0
while :; do
  if mkdir "$LOCK" 2>/dev/null; then
    echo "$$" > "$LOCK/pid"
    break
  fi
  if [ ! -d "$LOCK" ]; then
    echo "Can't make the lock $LOCK." >&2
    exit 1
  fi
  # Only one waiter at a time clears a stale lock, and it checks again first,
  # so that it never removes a lock that another waiter has just taken.
  if is_stale && mkdir "$CLEAR" 2>/dev/null; then
    if is_stale; then rm -rf "$LOCK"; fi
    rmdir "$CLEAR"
    continue
  fi
  # A clearing lock older than a minute is left from a run that was killed.
  if [ -n "$(find "$CLEAR" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then rmdir "$CLEAR" 2>/dev/null; fi
  if [ "$waited" -eq 0 ]; then
    echo "Waiting for another Scryfall run to finish ($LOCK)." >&2
    waited=1
  fi
  sleep "$POLL"
done

trap 'rm -rf "$LOCK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"$@"
