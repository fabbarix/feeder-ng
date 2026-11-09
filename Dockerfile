# Feeder image: builds the SPA, embeds it in a static Go binary, and runs it as
# a non-root user with the data on the /data volume.

# Stage 1: the frontend.
FROM node:24-alpine AS web
RUN npm install -g pnpm@10.28.1
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# Stage 2: the server binary, with the SPA embedded.
FROM golang:1.26 AS build
ARG TARGETOS=linux
ARG TARGETARCH=amd64
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN mkdir -p /out/data \
 && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/feeder ./cmd/feeder

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
