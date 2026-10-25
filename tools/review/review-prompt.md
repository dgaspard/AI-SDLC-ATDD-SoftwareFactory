# Factory engineering review

Read AGENTS.md, the affected frozen contract and design. Review the final diff and
exact-tree test records. Check ownership, dependency direction, explicit immutable
identity, path containment, trust authority, subprocess lifecycle, failure propagation,
post-cleanup evidence validation and unchanged evidence-v1 meanings. Factory runtime
must not import consumer code. Keep boundary fixtures neutral and independently assert
behavior. Never weaken tests or refresh a human freeze. Run `npm run test:verify` on
a frozen implementation tree; report unverified proposed specifications as such.

Require a fresh documentation pass following docs/README.md. Report actionable findings
with file/line, impact and reproduction; distinguish existing limitations and deferred
lifecycle work. App operations must use the required wrapper, with no automatic approval,
merge or protection bypass. Consumer-specific threat models, accepted risks and domain
assertions are reviewed in the consumer repository, not copied into factory mechanisms.
