#!/usr/bin/env bash
# Builds the LinkML toolchain the schema is generated with, and applies the
# patches in schema/patches/ to it.
#
# LinkML is a Python tool and deliberately not an npm dependency — nothing in CI,
# the app build or `npm test` may need it. Only `npm run schema:gen` does.
#
# Idempotent: safe to re-run. Re-running re-applies cleanly because already-applied
# patches are detected and skipped.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
venv="${LINKML_VENV:-$root/.linkml}"
patches="$root/schema/patches"

if [ ! -x "$venv/bin/gen-typescript" ]; then
  echo "creating $venv"
  python3 -m venv "$venv"
  "$venv/bin/pip" install --quiet --upgrade pip
  "$venv/bin/pip" install --quiet linkml
fi

site="$("$venv/bin/python" -c 'import linkml, pathlib; print(pathlib.Path(linkml.__file__).parent.parent)')"

shopt -s nullglob
for patch in "$patches"/*.patch; do
  name="$(basename "$patch")"
  if patch -p0 -d "$site" --dry-run --silent --reverse --force < "$patch" >/dev/null 2>&1; then
    echo "already applied: $name"
    continue
  fi
  echo "applying: $name"
  patch -p0 -d "$site" < "$patch"
done

echo
"$venv/bin/python" -c 'import linkml; print("linkml", getattr(linkml, "__version__", "?"), "ready at", "'"$venv"'")'
