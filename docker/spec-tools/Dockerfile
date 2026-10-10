# Local-only image for the test doubles that live in the protected spec/ tree: the fake
# payment provider and the OTLP test collector (DC-005). Never deployed to the cloud.
# File modes are normalized in the staging stage (owned by root, world-readable, nothing
# writable) so the image never depends on the builder's umask or checkout.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS stage
WORKDIR /app/spec
COPY spec/package.json spec/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY spec/fakes/payment/ fakes/payment/
COPY spec/harness/collector/ harness/collector/
RUN chmod -R u=rwX,go=rX,a-w /app

FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
WORKDIR /app
COPY --from=stage /app/ /app/
USER node
CMD ["spec/fakes/payment/start"]
