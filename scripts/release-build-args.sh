#!/usr/bin/env bash
#
# release-build-args.sh — emit the `--build-arg NEXT_PUBLIC_RELEASE_*=...` flags
# that make the deployed web image's footer ReleaseBadge show the real CalVer tag
# (linking to its GitHub release notes) instead of "dev / Local development build".
#
# WHY: production images build with `az acr build` from a context that has NO git
# tags, so apps/web/next.config.mjs's `git describe` fallback yields "dev". The
# Dockerfile's build stage accepts these values as build args and inlines them via
# next.config.mjs at `next build`. This script derives the values from git + the
# GitHub release and prints the flags to splice into the `az acr build` line.
#
# USAGE:
#   bash scripts/release-build-args.sh [TAG]
#     TAG  release tag to deploy (default: latest `git describe --tags --abbrev=0`)
#
#   # Splice the flags into az acr build (see infra/azure/README.md). CAPTURE the
#   # output and ABORT on failure FIRST: an inline `$(...)` would swallow this
#   # script's non-zero exit (HEAD not at tag / dirty tree) and build with the
#   # Dockerfile's "dev" defaults. The release TITLE can contain spaces, so the
#   # captured flags are shell-quoted and the build line MUST be run through `eval`:
#   BUILD_ARGS=$(bash scripts/release-build-args.sh "<tag>") || exit 1
#   eval "az acr build --registry acralztyhlgn6o --image project50-web:<sha> \
#     --platform linux/amd64 --file apps/web/Dockerfile $BUILD_ARGS ."
#
#   # Or have the script print the whole, ready-to-eval az acr build line:
#   ACR_LINE=1 bash scripts/release-build-args.sh <tag>
#
# Degrades gracefully: if `gh` (or the release) is unavailable, TITLE falls back
# to the tag name and URL is empty — the badge still shows the real tag/sha/time.
set -euo pipefail

# --- TAG: explicit arg, else the latest tag reachable from HEAD --------------
TAG="${1:-}"
if [ -z "$TAG" ]; then
  # `--abbrev=0` returns the nearest OLDER tag even when HEAD isn't that release;
  # the HEAD-equivalence check below rejects that case so the badge never links to
  # stale release metadata for code that isn't actually at the tag.
  TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
fi
if [ -z "$TAG" ]; then
  echo "release-build-args.sh: no tag given and no git tag found" >&2
  exit 1
fi

# --- SHA + build time --------------------------------------------------------
SHA="$(git rev-parse --short=7 HEAD)"
TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- HARD GATE: $TAG must be a REAL git tag ----------------------------------
# `git rev-list`/`rev-parse` happily resolve HEAD, a branch (main), or a raw sha,
# which would PASS the HEAD check below and silently emit
# NEXT_PUBLIC_RELEASE_TAG=<non-tag> with no release URL — defeating the script's
# purpose. Require $TAG to peel to an actual tag ref before going further.
if ! git rev-parse --verify --quiet "refs/tags/$TAG^{commit}" >/dev/null 2>&1; then
  echo "release-build-args: '$TAG' is not a git tag — pass the CalVer release tag" >&2
  exit 1
fi

# --- HARD GATE: the selected tag MUST point at HEAD --------------------------
# The image is built from HEAD, so the badge's tag/title/url must describe HEAD.
# If the (now-verified real) tag resolves to a different commit (a stale
# `git describe` fallback, or an explicit tag that isn't checked out), FAIL —
# building would ship newer code with a badge linking to the wrong release.
HEAD_FULL="$(git rev-parse HEAD)"
TAG_FULL="$(git rev-list -n1 "refs/tags/$TAG" 2>/dev/null || true)"
if [ "$TAG_FULL" != "$HEAD_FULL" ]; then
  echo "release-build-args: HEAD ($SHA) is not at tag $TAG — deploy from a tagged commit or pass the exact tag" >&2
  exit 1
fi

# --- HARD GATE: the working tree must be CLEAN --------------------------------
# `az acr build ... .` uploads the whole working dir, INCLUDING uncommitted /
# staged changes. The tag/HEAD gate only proves committed HEAD is at $TAG, so a
# dirty tree would bake the $TAG + release URL into an image built from code that
# isn't in that release. Refuse to emit build args for a dirty tree.
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "release-build-args: working tree has uncommitted changes — commit or stash before deploying" >&2
  exit 1
fi

# --- TITLE + URL from the GitHub release (best effort) -----------------------
# The commit subject is the honest fallback whenever the release name is missing
# or carries no feature intro of its own (gh absent, release missing, or the name
# is just the bare tag).
SUBJECT="$(git log -1 --format=%s 2>/dev/null || true)"
TITLE="${SUBJECT:-$TAG}"
URL=""
if command -v gh >/dev/null 2>&1; then
  # gh's own `-q` (jq expression) reads the fields without needing jq installed.
  REL_NAME="$(gh release view "$TAG" --json name -q .name 2>/dev/null || true)"
  REL_URL="$(gh release view "$TAG" --json url -q .url 2>/dev/null || true)"
  [ -n "$REL_URL" ] && URL="$REL_URL"

  if [ -n "$REL_NAME" ]; then
    # release.yml names releases "<TAG> — <subject>". The ReleaseBadge already
    # renders the CalVer TAG before the title, so emitting the full name would
    # show the tag TWICE. Strip a leading "<TAG>" + en-dash/hyphen separator so
    # the badge shows just the feature intro.
    STRIPPED="$REL_NAME"
    case "$STRIPPED" in
      "$TAG"*) STRIPPED="${STRIPPED#"$TAG"}" ;;
    esac
    # Drop a leading separator: " — " (en dash) or " - " (hyphen), any spacing.
    STRIPPED="${STRIPPED#"${STRIPPED%%[![:space:]]*}"}"   # ltrim
    case "$STRIPPED" in
      "—"*) STRIPPED="${STRIPPED#—}" ;;
      "-"*) STRIPPED="${STRIPPED#-}" ;;
    esac
    # Trim surrounding whitespace.
    STRIPPED="${STRIPPED#"${STRIPPED%%[![:space:]]*}"}"   # ltrim
    STRIPPED="${STRIPPED%"${STRIPPED##*[![:space:]]}"}"   # rtrim
    # Use the stripped intro only if it's non-empty and not just the tag again;
    # otherwise keep the commit-subject fallback.
    if [ -n "$STRIPPED" ] && [ "$STRIPPED" != "$TAG" ]; then
      TITLE="$STRIPPED"
    fi
  fi
fi

# --- Emit ---------------------------------------------------------------------
FLAGS=(
  "--build-arg" "NEXT_PUBLIC_RELEASE_TAG=$TAG"
  "--build-arg" "NEXT_PUBLIC_RELEASE_SHA=$SHA"
  "--build-arg" "NEXT_PUBLIC_RELEASE_TIME=$TIME"
  "--build-arg" "NEXT_PUBLIC_RELEASE_TITLE=$TITLE"
  "--build-arg" "NEXT_PUBLIC_RELEASE_URL=$URL"
)

# Emit shell-quoted (%q) so a spaceful TITLE survives. Both outputs are intended
# to be expanded with `eval` (see header / README), so re-quoting is correct.
if [ "${ACR_LINE:-}" = "1" ]; then
  printf 'az acr build --registry %s --image project50-web:%s --platform linux/amd64 --file apps/web/Dockerfile' \
    "${ACR_REGISTRY:-acralztyhlgn6o}" "$SHA"
  printf ' %q' "${FLAGS[@]}"
  printf ' .\n'
else
  printf '%q ' "${FLAGS[@]}"
  printf '\n'
fi
