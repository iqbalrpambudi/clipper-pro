#!/usr/bin/env bash
# Hitung versi rilis berikutnya dari Conventional Commits sejak tag v* terakhir.
# feat! / BREAKING CHANGE -> major, feat -> minor, fix/perf -> patch.
# Tanpa perubahan yang layak rilis (chore/docs/dst) -> output kosong.
set -euo pipefail

LAST=$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)
BASE="${LAST#v}"
BASE="${BASE:-0.0.0}"
RANGE="${LAST:+$LAST..}HEAD"

SUBJECTS=$(git log "$RANGE" --no-merges --format=%s)
BODIES=$(git log "$RANGE" --no-merges --format=%b)

IFS=. read -r MAJ MIN PAT <<<"$BASE"
if grep -qE '^[a-z]+(\([^)]*\))?!:' <<<"$SUBJECTS" || grep -q '^BREAKING CHANGE' <<<"$BODIES"; then
  MAJ=$((MAJ + 1)); MIN=0; PAT=0
elif grep -qE '^feat(\([^)]*\))?:' <<<"$SUBJECTS"; then
  MIN=$((MIN + 1)); PAT=0
elif grep -qE '^(fix|perf)(\([^)]*\))?:' <<<"$SUBJECTS"; then
  PAT=$((PAT + 1))
else
  exit 0
fi
echo "$MAJ.$MIN.$PAT"
