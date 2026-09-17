#!/usr/bin/env bash
#
# Publishes a directory to the gh-pages branch, or removes a subdirectory from
# it. Plain git rather than a third-party action, so there is no extra thing to
# trust in the deploy path.
#
# The branch holds the production site at its root and one directory per open
# pull request:
#
#   /                 production build, deployed from main
#   /pr-12/           preview for PR #12
#   /pr-12/screenshots/
#
# Production deploys therefore have to leave pr-* directories alone, and preview
# deploys have to leave everything else alone.
#
# Usage:
#   publish-to-gh-pages.sh --source dist --dest .       --message "Deploy main"
#   publish-to-gh-pages.sh --source dist --dest pr-12   --message "Preview PR #12"
#   publish-to-gh-pages.sh --remove pr-12               --message "Remove preview"
set -euo pipefail

SOURCE_DIR=""
DEST_DIR=""
REMOVE_DIR=""
MESSAGE=""
BRANCH="gh-pages"
MAX_ATTEMPTS=8

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)  SOURCE_DIR="$2"; shift 2 ;;
    --dest)    DEST_DIR="$2";   shift 2 ;;
    --remove)  REMOVE_DIR="$2"; shift 2 ;;
    --message) MESSAGE="$2";    shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$MESSAGE" ]]; then
  echo "--message is required" >&2
  exit 2
fi

if [[ -z "$REMOVE_DIR" && ( -z "$SOURCE_DIR" || -z "$DEST_DIR" ) ]]; then
  echo "Either --remove, or both --source and --dest, are required" >&2
  exit 2
fi

if [[ -n "$SOURCE_DIR" && ! -d "$SOURCE_DIR" ]]; then
  echo "Source directory does not exist: $SOURCE_DIR" >&2
  exit 1
fi

# This script runs `rm -rf` on a path built from these arguments. They come from
# workflow values today, but a publish script should not depend on its caller
# being careful: reject anything that could escape the checkout.
assert_safe_subdir() {
  local label="$1" value="$2" allow_root="${3:-no}"

  if [[ -z "$value" ]]; then
    echo "$label must not be empty" >&2
    exit 2
  fi

  if [[ "$value" == "." ]]; then
    if [[ "$allow_root" == "allow_root" ]]; then
      return 0
    fi
    echo "$label must name a subdirectory, not the branch root" >&2
    exit 2
  fi

  if [[ "$value" == /* ]]; then
    echo "$label must be a relative path, not absolute: '$value'" >&2
    exit 2
  fi

  local component
  while IFS= read -r component; do
    if [[ "$component" == ".." ]]; then
      echo "$label must not contain '..': '$value'" >&2
      exit 2
    fi
  done < <(tr '/' '\n' <<< "$value")
}

[[ -n "$DEST_DIR" ]] && assert_safe_subdir "--dest" "$DEST_DIR" allow_root
[[ -n "$REMOVE_DIR" ]] && assert_safe_subdir "--remove" "$REMOVE_DIR"

REPO_URL="${GH_PAGES_REPO_URL:-https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git}"
SOURCE_ABS=""
[[ -n "$SOURCE_DIR" ]] && SOURCE_ABS="$(cd "$SOURCE_DIR" && pwd)"

# Rebuilt from scratch on every attempt, so a losing race just retries cleanly
# against whatever the branch looks like now.
attempt_publish() {
  local workdir
  workdir="$(mktemp -d)"
  trap 'rm -rf "$workdir"' RETURN

  git -C "$workdir" init -q
  git -C "$workdir" config user.name "github-actions[bot]"
  git -C "$workdir" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git -C "$workdir" remote add origin "$REPO_URL"

  if git -C "$workdir" fetch -q --depth=1 origin "$BRANCH" 2>/dev/null; then
    git -C "$workdir" checkout -q FETCH_HEAD
    git -C "$workdir" checkout -q -B "$BRANCH"
  else
    echo "Branch $BRANCH does not exist yet; creating it."
    git -C "$workdir" checkout -q --orphan "$BRANCH"
  fi

  if [[ -n "$REMOVE_DIR" ]]; then
    if [[ ! -d "$workdir/$REMOVE_DIR" ]]; then
      echo "Nothing to remove: $REMOVE_DIR is not present."
      return 0
    fi
    rm -rf "${workdir:?}/${REMOVE_DIR:?}"
  elif [[ "$DEST_DIR" == "." ]]; then
    # Production deploy: clear the root but keep pull request previews.
    find "$workdir" -mindepth 1 -maxdepth 1 \
      ! -name '.git' \
      ! -name 'pr-*' \
      -exec rm -rf {} +
    cp -R "$SOURCE_ABS/." "$workdir/"
  else
    rm -rf "${workdir:?}/${DEST_DIR:?}"
    mkdir -p "$workdir/$DEST_DIR"
    cp -R "$SOURCE_ABS/." "$workdir/$DEST_DIR/"
  fi

  # Pages would otherwise run the files through Jekyll, which drops paths
  # beginning with an underscore.
  touch "$workdir/.nojekyll"

  git -C "$workdir" add -A
  if git -C "$workdir" diff --cached --quiet; then
    echo "No changes to publish."
    return 0
  fi

  git -C "$workdir" commit -q -m "$MESSAGE"
  git -C "$workdir" push -q origin "$BRANCH"
}

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if attempt_publish; then
    echo "Published to $BRANCH on attempt $attempt."
    exit 0
  fi
  echo "Attempt $attempt failed (the branch likely moved under us); retrying." >&2
  sleep $(( attempt * 2 ))
done

echo "Failed to publish to $BRANCH after $MAX_ATTEMPTS attempts." >&2
exit 1
