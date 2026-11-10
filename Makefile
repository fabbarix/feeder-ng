# Feeder build targets. Run from the repository root.

.PHONY: check build run docker clean

GO ?= go

check:
	scripts/check.sh

build:
	pnpm -C web install --frozen-lockfile
	pnpm -C web build
	$(GO) build -buildvcs=false -o build/feeder ./cmd/feeder

# Needs BuildKit (the Dockerfile uses FROM --platform=$$BUILDPLATFORM); see docs/dev/deploy.md.
docker:
	DOCKER_BUILDKIT=1 docker build -t feeder:dev .

run: build
	./build/feeder

clean:
	rm -rf build web/dist/index.html web/dist/assets
