# Feeder image: builds the SPA, embeds it in a static Go binary, and runs it as
# a non-root user with the data on the /data volume.

# Global ARG, declared before the first FROM so it can be used in FROM --platform.
# BuildKit overrides it with the real build platform; the default only applies to legacy builds.
ARG BUILDPLATFORM=linux/amd64

# Stage 1: the frontend.
FROM --platform=$BUILDPLATFORM node:24-alpine AS web
RUN npm install -g pnpm@10.28.1
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
# pnpm build type-checks with tsconfig.build.json, which excludes tests, so test data outside web/ is not needed.
RUN pnpm build

# Stage 2: the server binary, with the SPA embedded. It runs on the build machine and
# cross-compiles for TARGETOS/TARGETARCH, so a multi-arch build needs no emulation.
FROM --platform=$BUILDPLATFORM golang:1.26 AS build
ARG TARGETOS=linux
ARG TARGETARCH=amd64
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN mkdir -p /out/data \
 && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -buildvcs=false -trimpath -ldflags="-s -w" -o /out/feeder ./cmd/feeder

# Stage 3: the runtime image. No shell, no root.
FROM gcr.io/distroless/static:nonroot
COPY --from=build /out/feeder /usr/local/bin/feeder
COPY --from=build --chown=65532:65532 /out/data /data
ENV FEEDER_DATA_DIR=/data \
    FEEDER_ADDR=:8080
VOLUME /data
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/feeder"]
