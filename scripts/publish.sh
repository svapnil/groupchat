#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 Svapnil Ankolkar
# Publish groupchat: syncs versions across all platform packages, then publishes.
# Usage: ./scripts/publish.sh [--dry-run]

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

DRY_RUN=""
DRY_RUN_LABEL=""
if [ "$1" = "--dry-run" ]; then
  DRY_RUN="--dry-run"
  DRY_RUN_LABEL=" [DRY RUN]"
  echo "========================================="
  echo "  DRY RUN — nothing will be published"
  echo "========================================="
fi

# Read version from main package.json
VERSION=$(node -p "require('$ROOT_DIR/package.json').version")
echo "Publishing version: $VERSION${DRY_RUN_LABEL}"

PLATFORMS="darwin-arm64 darwin-x64 linux-x64 linux-arm64 win32-x64"

# Sync version into each platform package.json
for platform in $PLATFORMS; do
  PKG_DIR="$ROOT_DIR/npm/${platform}"
  PKG_JSON="$PKG_DIR/package.json"

  if [ ! -f "$PKG_JSON" ]; then
    echo "Error: $PKG_JSON not found" >&2
    exit 1
  fi

  # Update version in platform package.json
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$PKG_JSON', 'utf-8'));
    pkg.version = '$VERSION';
    fs.writeFileSync('$PKG_JSON', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "  Updated @groupchat-cli/${platform} to $VERSION"
done

# Sync optionalDependencies versions in main package.json
node -e "
  const fs = require('fs');
  const pkgPath = '$ROOT_DIR/package.json';
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  for (const dep of Object.keys(pkg.optionalDependencies || {})) {
    pkg.optionalDependencies[dep] = '$VERSION';
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
"
echo "  Updated optionalDependencies to $VERSION"

# Build all binaries
echo ""
echo "Building binaries..."
cd "$ROOT_DIR"
bun run build.ts --all

# Verify binaries exist
for platform in $PLATFORMS; do
  BINARY_NAME="groupchat"
  case "$platform" in
    win32-*) BINARY_NAME="groupchat.exe" ;;
  esac

  BINARY="$ROOT_DIR/npm/${platform}/bin/${BINARY_NAME}"
  if [ ! -f "$BINARY" ]; then
    echo "Error: binary not found at $BINARY" >&2
    echo "Build may have failed for this target." >&2
    exit 1
  fi
done
echo "All binaries built successfully."

# Publish platform packages first
echo ""
echo "Publishing platform packages...${DRY_RUN_LABEL}"
for platform in $PLATFORMS; do
  PKG_DIR="$ROOT_DIR/npm/${platform}"
  echo "  Publishing @groupchat-cli/${platform}@${VERSION}...${DRY_RUN_LABEL}"
  cd "$PKG_DIR"
  npm publish $DRY_RUN
done

# Publish main package
echo ""
echo "Publishing main package...${DRY_RUN_LABEL}"
cd "$ROOT_DIR"
npm publish $DRY_RUN

echo ""

# Create GitHub Release with binaries
echo "Creating GitHub Release v${VERSION}...${DRY_RUN_LABEL}"
ASSETS=""
for platform in $PLATFORMS; do
  BINARY_NAME="groupchat"
  case "$platform" in
    win32-*) BINARY_NAME="groupchat.exe" ;;
  esac
  ASSETS="$ASSETS $ROOT_DIR/npm/${platform}/bin/${BINARY_NAME}#groupchat-${platform}$([ "$BINARY_NAME" = "groupchat.exe" ] && echo ".exe")"
done

if [ -n "$DRY_RUN" ]; then
  echo "  Would create release v${VERSION} with assets:"
  for platform in $PLATFORMS; do
    BINARY_NAME="groupchat"
    case "$platform" in
      win32-*) BINARY_NAME="groupchat.exe" ;;
    esac
    echo "    groupchat-${platform}$([ "$BINARY_NAME" = "groupchat.exe" ] && echo ".exe")"
  done
else
  gh release create "v${VERSION}" --generate-notes $ASSETS
  echo "  GitHub Release v${VERSION} created."
fi

echo ""
if [ -n "$DRY_RUN" ]; then
  echo "DRY RUN complete — nothing was published."
else
  echo "Successfully published groupchat@${VERSION} and all platform packages!"
  echo "GitHub Release: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/v${VERSION}"
fi
