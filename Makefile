# Feeder build targets. Run from the repository root.

.PHONY: check build run docker clean

GO ?= go

check:
	scripts/check.sh

build:
	pnpm -C web install --frozen-lockfile
	pnpm -C web build
	$(GO) build -buildvcs=false -o build/feeder ./cmd/feeder

# Uses buildx when it is installed (the Dockerfile uses FROM --platform=$$BUILDPLATFORM); otherwise falls back to plain docker build. See docs/dev/deploy.md.
docker:
	@if docker buildx version >/dev/null 2>&1; then \
		docker buildx build --load -t feeder:dev . ; \
	else \
		docker build -t feeder:dev . ; \
	fi

run: build
	./build/feeder

clean:
	rm -rf build web/dist/index.html web/dist/assets
