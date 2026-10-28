# Component image, not a credential-bearing service or qualified launcher.
FROM node@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
COPY --chown=0:0 broker/ /opt/factory/
USER 65534:65534
WORKDIR /opt/factory
ENTRYPOINT ["node"]
CMD ["--test", "model-broker.test.mjs"]
