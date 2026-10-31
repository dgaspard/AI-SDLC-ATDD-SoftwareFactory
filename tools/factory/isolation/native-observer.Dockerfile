ARG QUALIFICATION_BASE
FROM node@sha256:66d2eb8b463114d1f416d61dbd5fa9cea83e8fc250feb997338467728a06124b AS compiler
ARG FAULT_FLAGS
COPY *.c /build/
RUN cc -O2 -Wall -Wextra -Werror ${FAULT_FLAGS} /build/syscall-observer.c -o /build/syscall-observer && cc -O2 -Wall -Wextra -Werror /build/syscall-guard.c -o /build/syscall-guard && cc -pthread -O2 -Wall -Wextra -Werror /build/syscall-observer-cases.c -o /build/syscall-observer-cases
FROM ${QUALIFICATION_BASE}
COPY --from=compiler /build/syscall-observer /build/syscall-guard /build/syscall-observer-cases /opt/factory/
COPY native-audited-runner.mjs /opt/factory/audited-runner.mjs
COPY model-channel.mjs coding-client.mjs /opt/factory/
COPY broker-codex-probe.mjs bedrock-converse.mjs model-broker.mjs broker-upstream.mjs broker-protocol.mjs change-support.mjs core.mjs processes.mjs /opt/protocol/
ENTRYPOINT ["/opt/factory/syscall-observer"]
