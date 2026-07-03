# syntax=docker/dockerfile:1
FROM oven/bun:1 AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile || bun install
RUN bun run --cwd packages/ui build
RUN bun build --compile --target=bun-linux-x64 apps/cli/src/main.ts --outfile /out/skillkeep

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/skillkeep /usr/local/bin/skillkeep
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD curl -f http://localhost:8080/healthz || exit 1
ENTRYPOINT ["skillkeep", "daemon", "--mode", "hub", "--data", "/data"]
