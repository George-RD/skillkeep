# syntax=docker/dockerfile:1
FROM oven/bun:1 AS build
WORKDIR /src
# BuildKit sets this automatically from --platform (or the host's native platform when unset, e.g.
# a plain `docker build` on an Apple Silicon Mac) -- the compiled sidecar binary MUST match the
# base image's architecture below, or the container fails at startup with "Dynamic loader not
# found" (an x86_64 binary can't run under an arm64 base image, and vice versa).
ARG TARGETARCH
COPY . .
RUN bun install --frozen-lockfile || bun install
RUN bun run --cwd packages/ui build
RUN case "$TARGETARCH" in \
      amd64) bun_target=bun-linux-x64 ;; \
      arm64) bun_target=bun-linux-arm64 ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    bun build --compile --target="$bun_target" apps/cli/src/main.ts --outfile /out/skillkeep

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/skillkeep /usr/local/bin/skillkeep
VOLUME /data
# Default bind port for a plain `docker run` (matches EXPOSE + the healthcheck below); Railway
# overrides PORT at container runtime, and the daemon/healthcheck both honour that override too.
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD curl -f "http://localhost:${PORT:-8080}/healthz" || exit 1
ENTRYPOINT ["skillkeep", "daemon", "--mode", "hub", "--data", "/data"]
