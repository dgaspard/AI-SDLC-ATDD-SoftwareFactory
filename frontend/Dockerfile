# ENV-01 (DC-001): static frontend server. Build context is the repository root because
# the server serves the protected design assets in spec/frontend/.
# File modes are normalized in the staging stage (owned by root, world-readable, nothing
# writable) so the image never depends on the builder's umask or checkout.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS stage
WORKDIR /app
COPY spec/frontend/styles/ spec/frontend/styles/
COPY spec/frontend/assets/ spec/frontend/assets/
COPY frontend/ frontend/
RUN chmod -R u=rwX,go=rX,a-w /app

FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=stage /app/ /app/
USER node
EXPOSE 3000
CMD ["frontend/start"]
