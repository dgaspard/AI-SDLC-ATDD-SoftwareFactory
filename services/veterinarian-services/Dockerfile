# ENV-01 (DC-001): one image per runnable project, built once and promoted unchanged.
# Build context is the repository root: the shared platform reads spec/contracts/ and
# spec/seed-data/. Configuration comes only from the environment (runtime contract).
# File modes are normalized in the staging stage (owned by root, world-readable, nothing
# writable) so the image never depends on the builder's umask or checkout.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS stage
WORKDIR /app/services/platform
COPY services/platform/package.json services/platform/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
WORKDIR /app
COPY spec/contracts/ spec/contracts/
COPY spec/seed-data/ spec/seed-data/
COPY services/platform/ services/platform/
COPY services/veterinarian-services/ services/veterinarian-services/
RUN chmod -R u=rwX,go=rX,a-w /app

FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
ENV NODE_ENV=production SEED_DATA_DIR=/app/spec/seed-data PORT=4003
WORKDIR /app
COPY --from=stage /app/ /app/
USER node
EXPOSE 4003
CMD ["services/veterinarian-services/start"]
