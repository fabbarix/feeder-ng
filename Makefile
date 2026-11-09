# Feeder build targets. Run from the repository root.

.PHONY: check build run clean

GO ?= go

check:
	scripts/check.sh

build:
	pnpm -C web install --frozen-lockfile
	pnpm -C web build
	$(GO) build -o build/feeder ./cmd/feeder

run: build
	./build/feeder

clean:
	rm -rf build web/dist/index.html web/dist/assets
