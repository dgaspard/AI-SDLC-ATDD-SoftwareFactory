# Factory observability boundary

Factory mechanisms report suite exits, startup/tooling failures, cleanup outcomes,
consumer identity, immutable factory revision and evidence hashes. Preserve the frozen
consumer interface and evidence-v1 meanings. The separate consumer envelope is not
an application telemetry contract or a production certification.

PetClinic telemetry semantics, OBS IDs, coverage, trace propagation and performance
assertions are maintained in [consumer observability](https://github.com/dgaspard/ai-sdlc-petclinic/blob/8c16963fcb9392907ebb14a62aa1537eca12bc43/docs/observability.md).
Do not introduce application defaults into reusable mechanisms. Organizational telemetry
policy remains separately adopted; proposed standards are not binding requirements.
The [pre-separation document](https://github.com/dgaspard/AI-SDLC-ATDD-SoftwareFactory/blob/9809c120cafd0ad867be6568621fac3ef54f1780/docs/observability.md)
preserves historical requirements and coverage claims for their recorded revisions.
