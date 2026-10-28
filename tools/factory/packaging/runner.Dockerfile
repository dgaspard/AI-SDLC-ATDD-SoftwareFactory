# Build only from a verified archive staged outside the repository.
FROM node@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
COPY --chown=0:0 vendor/ /opt/codex/
ENV PATH="/opt/codex/bin:/opt/codex/codex-path:${PATH}"
ENV HOME=/tmp/home CODEX_HOME=/tmp/home/.codex
USER 65534:65534
WORKDIR /tmp
ENTRYPOINT ["/opt/codex/bin/codex"]
CMD ["--version"]
