# Fixed native prerequisite image; no coding agent, credentials or launcher activation.
FROM node@sha256:66d2eb8b463114d1f416d61dbd5fa9cea83e8fc250feb997338467728a06124b AS compiler
COPY syscall-stop-probe.c /build/probe.c
RUN cc -pthread -O2 -Wall -Wextra -Werror /build/probe.c -o /build/probe
FROM node@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
COPY --from=compiler /build/probe /opt/factory/syscall-stop-probe
USER 0:0
ENTRYPOINT ["/opt/factory/syscall-stop-probe"]
