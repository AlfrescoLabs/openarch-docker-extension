# syntax=docker/dockerfile:1

# The UI.
FROM --platform=$BUILDPLATFORM node:22-alpine AS ui
WORKDIR /ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ui/ ./
ARG EXTENSION_VERSION=0.0.0-dev
RUN EXTENSION_VERSION=$EXTENSION_VERSION npm run build

# The openarch-dd helper for each host OS, on the target CPU.
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS helper
ARG TARGETARCH
WORKDIR /src
COPY host/ ./
RUN for os in darwin linux windows; do \
      ext=""; [ "$os" = windows ] && ext=.exe; \
      CGO_ENABLED=0 GOOS=$os GOARCH=$TARGETARCH go build -trimpath -ldflags "-s -w" -o /out/$os/openarch-dd$ext . ; \
    done

# The extension. The openarch binaries come from build/cli/<arch>/<os>/,
# filled by scripts/cli-release.sh (checked release) or scripts/cli-local.sh.
FROM scratch
ARG TARGETARCH
ARG EXTENSION_VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="Hyland OpenArch" \
      org.opencontainers.image.description="Start Hyland OpenArch, an open source data layer for AI, and see permission-aware search with sample data. Not an official Hyland product." \
      org.opencontainers.image.vendor="AlfrescoLabs" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/AlfrescoLabs/openarch-docker-extension" \
      org.opencontainers.image.version="${EXTENSION_VERSION}" \
      com.docker.desktop.extension.api.version=">= 0.3.4" \
      com.docker.desktop.extension.icon="https://raw.githubusercontent.com/AlfrescoLabs/openarch-docker-extension/main/openarch.svg" \
      com.docker.extension.categories="database,utility-tools" \
      com.docker.extension.publisher-url="https://github.com/AlfrescoLabs" \
      com.docker.extension.additional-urls='[{"title":"Source","url":"https://github.com/AlfrescoLabs/openarch-docker-extension"},{"title":"CLI for OpenArch","url":"https://github.com/AlfrescoLabs/openarch-cli"},{"title":"Hyland OpenArch","url":"https://github.com/Hyland/OpenArch"}]' \
      com.docker.extension.changelog="https://github.com/AlfrescoLabs/openarch-docker-extension/releases" \
      com.docker.extension.screenshots='[{"alt":"Try it: the same query as the admin, alice and bob","url":"https://raw.githubusercontent.com/AlfrescoLabs/openarch-docker-extension/main/docs/screenshots/try-it-light.png"},{"alt":"Setup: the checks, the demo mode and the version","url":"https://raw.githubusercontent.com/AlfrescoLabs/openarch-docker-extension/main/docs/screenshots/setup-light.png"},{"alt":"Dashboard: the health of each service, the links and the login","url":"https://raw.githubusercontent.com/AlfrescoLabs/openarch-docker-extension/main/docs/screenshots/dashboard-light.png"},{"alt":"Connect AI: the MCP setup for AI clients","url":"https://raw.githubusercontent.com/AlfrescoLabs/openarch-docker-extension/main/docs/screenshots/connect-ai-light.png"},{"alt":"Try it, dark mode","url":"https://raw.githubusercontent.com/AlfrescoLabs/openarch-docker-extension/main/docs/screenshots/try-it-dark.png"}]' \
      com.docker.extension.detailed-description="<p>Start Hyland OpenArch on your machine: the REST API, MongoDB and OpenSearch, with one click.</p><p>Load two demo users and sample documents, and run the same query as each user: OpenArch returns only the documents that the caller may read.</p><p>Choose the OpenArch version (recommended, latest or any tag), and connect AI clients through the MCP server of the CLI for OpenArch.</p><p>Not an official Hyland product: an AlfrescoLabs project that Hyland does not officially support.</p>"
COPY metadata.json openarch.svg /
COPY --from=ui /ui/dist /ui
COPY --from=helper /out/ /
COPY build/cli/${TARGETARCH}/ /
