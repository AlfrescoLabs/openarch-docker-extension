#!/bin/sh
# Builds the openarch CLI from a local source folder for every OS and CPU
# that the extension ships, into build/cli/<arch>/<os>/. For development:
# releases use cli-release.sh, which checks the signatures.
set -eu
src=${1:?usage: cli-local.sh <path to openarch-cli source>}
out=$(pwd)/build/cli
version=$(git -C "$src" describe --tags --always --dirty 2>/dev/null || echo dev)
pkg=github.com/AlfrescoLabs/openarch-cli
for arch in amd64 arm64; do
  for os in darwin linux windows; do
    ext=""
    [ "$os" = windows ] && ext=.exe
    mkdir -p "$out/$arch/$os"
    (cd "$src" && CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -trimpath \
      -ldflags "-s -w -X $pkg/internal/version.Version=$version" \
      -o "$out/$arch/$os/openarch$ext" ./cmd/openarch)
  done
done
echo "Built openarch $version into $out"
