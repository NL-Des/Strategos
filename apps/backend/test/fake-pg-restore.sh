#!/bin/sh
# Faux pg_restore des tests e2e : note ses arguments et le contenu du dump dans FAKE_PG_LOG.
printf '%s\n' "$*" > "$FAKE_PG_LOG"
for last in "$@"; do :; done
cat "$last" >> "$FAKE_PG_LOG"
