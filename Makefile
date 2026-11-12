IMAGE       ?= alfrescolabs/openarch-docker-extension
TAG         ?= dev
CLI_VERSION ?= 0.6.0
CLI_SRC     ?= ../zz-openarch-cli
PLATFORMS   ?= linux/amd64,linux/arm64

.PHONY: cli-local cli-release test build install update debug validate push

# The openarch binaries for the image: from a local source folder, or a checked release.
cli-local:
	sh scripts/cli-local.sh $(CLI_SRC)

cli-release:
	sh scripts/cli-release.sh $(CLI_VERSION)

test:
	cd host && go vet ./... && go test ./...
	cd ui && npm test && npm run lint

build:
	docker build --build-arg EXTENSION_VERSION=$(TAG) -t $(IMAGE):$(TAG) .

install:
	docker extension install -f $(IMAGE):$(TAG)

update:
	docker extension update -f $(IMAGE):$(TAG)

# Opens the Chrome DevTools of the extension UI.
debug:
	docker extension dev debug $(IMAGE)

validate:
	docker extension validate $(IMAGE):$(TAG)

push:
	docker buildx build --push --platform $(PLATFORMS) --sbom=true --provenance=true \
		--build-arg EXTENSION_VERSION=$(TAG) -t $(IMAGE):$(TAG) .
