FROM node@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
COPY strace.deb /tmp/strace.deb
RUN dpkg-deb -x /tmp/strace.deb / && rm /tmp/strace.deb && mkdir /inputs && printf 'neutral protected fixture\n' > /inputs/protected.txt && ln -s protected.txt /inputs/symlink.txt && ln /inputs/protected.txt /inputs/hardlink.txt
COPY --chown=0:0 broker/ /opt/factory/broker/
COPY --chown=0:0 audit/ /opt/factory/audit/
USER 0:0
ENTRYPOINT ["node", "/opt/factory/audit/observer.mjs"]
