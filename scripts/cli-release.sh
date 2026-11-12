#!/bin/sh
# Downloads the openarch CLI release <version> for every OS and CPU that the
# extension ships, checks checksums.txt with cosign and the archives with
# sha256, and extracts the binaries into build/cli/<arch>/<os>/.
# Needs curl, cosign, tar, unzip and sha256sum (or shasum).
set -eu
version=${1:?usage: cli-release.sh <version, for example 0.6.0>}
version=${version#v}
base=https://github.com/AlfrescoLabs/openarch-cli/releases/download/v$version
out=$(pwd)/build/cli
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
curl -fsSLO "$base/checksums.txt"
curl -fsSLO "$base/checksums.txt.sigstore.json"
cosign verify-blob checksums.txt \
  --bundle checksums.txt.sigstore.json \
  --certificate-identity "https://github.com/AlfrescoLabs/openarch-cli/.github/workflows/release.yml@refs/tags/v$version" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
if command -v sha256sum >/dev/null; then sum="sha256sum"; else sum="shasum -a 256"; fi
for arch in amd64 arm64; do
  for os in darwin linux windows; do
    if [ "$os" = windows ]; then file=openarch_${version}_${os}_${arch}.zip; else file=openarch_${version}_${os}_${arch}.tar.gz; fi
    curl -fsSLO "$base/$file"
    grep " $file\$" checksums.txt | $sum -c -
    mkdir -p "$out/$arch/$os" x
    if [ "$os" = windows ]; then unzip -oq "$file" openarch.exe -d x; mv x/openarch.exe "$out/$arch/$os/"; else tar -xzf "$file" -C x openarch; mv x/openarch "$out/$arch/$os/"; fi
  done
done
echo "Checked and extracted openarch $version into $out"
