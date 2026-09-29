#!/bin/sh
# Faux pg_dump des tests e2e (pas de client PostgreSQL sur la machine de dev) :
# écrit un fichier factice à l'emplacement `--file=`, ou échoue si FAKE_PG_FAIL est posé.
if [ -n "$FAKE_PG_FAIL" ]; then
  echo "pg_dump: error: connection refused" >&2
  exit 1
fi
for arg in "$@"; do
  case "$arg" in
    --file=*) out="${arg#--file=}" ;;
  esac
done
printf 'dump factice\n%s\n' "$*" > "$out"
