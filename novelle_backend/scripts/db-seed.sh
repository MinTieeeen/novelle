#!/usr/bin/env bash
# Seeds (or resets) the Novelle mock data on the SQL Server in novelle/.env (the project's single settings file).
#
#   ./scripts/db-seed.sh           run database/seed/10 ... 90 as novelle_migrator
#   ./scripts/db-seed.sh reset     delete ALL data (except Genre) so the seed can be run again
#
# Needs in novelle/.env:  DB_HOST, MIGRATOR_PASSWORD  and either DEMO_PASSWORD (a BCrypt hash is made from it with
# Node + bcryptjs in a temporary folder) or DEMO_PASSWORD_HASH (a ready-made BCrypt hash, "$2a$10$...").
# Nothing secret is written to the repository.
set -euo pipefail
cd "$(dirname "$0")/.."

env_file=../.env
[ -f "$env_file" ] || { echo "novelle/.env not found (copy novelle/.env.example to novelle/.env)" >&2; exit 1; }
set -a; . <(tr -d '\r' < "$env_file"); set +a
: "${DB_HOST:?DB_HOST missing in novelle/.env}" "${MIGRATOR_PASSWORD:?MIGRATOR_PASSWORD missing in novelle/.env}"
export SQLCMDPASSWORD="$MIGRATOR_PASSWORD"

run_sql() {   # run_sql <file> [sqlcmd -v args...]
  local file="$1"; shift
  echo "=== $file ==="
  sqlcmd -S "$DB_HOST,1433" -U novelle_migrator -d NovelleDB -C -b -l 30 -f 65001 -W -s"|" "$@" -i "$file"
}

if [ "${1:-}" = "reset" ]; then
  run_sql database/seed/99_reset.sql -v CONFIRM=YES
  exit 0
fi

if [ -z "${DEMO_PASSWORD_HASH:-}" ]; then
  : "${DEMO_PASSWORD:?Set DEMO_PASSWORD or DEMO_PASSWORD_HASH in novelle/.env}"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  echo "Creating the BCrypt hash of DEMO_PASSWORD (bcryptjs, in a temporary folder)..."
  (cd "$tmp" && npm init -y >/dev/null 2>&1 && npm install bcryptjs@2.4.3 --silent --no-audit --no-fund >/dev/null 2>&1)
  DEMO_PASSWORD_HASH="$(cd "$tmp" && node -e 'console.log(require("bcryptjs").hashSync(process.argv[1], 10))' "$DEMO_PASSWORD")"
fi
case "$DEMO_PASSWORD_HASH" in '$2'*) ;; *) echo "DEMO_PASSWORD_HASH does not look like a BCrypt hash" >&2; exit 1;; esac

for f in 10_corpus 20_users 30_catalog 40_chapters 50_activity 90_finalize; do
  if [ "$f" = "20_users" ]; then
    run_sql "database/seed/$f.sql" -v DEMO_PASSWORD_HASH="$DEMO_PASSWORD_HASH"
  else
    run_sql "database/seed/$f.sql"
  fi
done
echo "Seed finished. Next: sqlcmd as novelle_readonly -i database/queries/99_check_invariants.sql (must return no rows)."
