# Agent GitHub authentication

Agents use the `ai-sdlc-bdd-agent` GitHub App, not the maintainer's personal account.

Configure these values in the ignored repository `.env` file:

```dotenv
GITHUB_APP_ID=5265528
GITHUB_CLIENT_ID=Iv23liPF5VtV0aFQ08N5
GITHUB_INSTALLATION_ID=170027882
GITHUB_APP_PRIVATE_KEY_PATH=/absolute/path/to/private-key.pem
```

The wrapper does not use `GITHUB_CLIENT_SECRET` or a personal `GITHUB_TOKEN`.
It signs an App JWT, verifies the installation and permissions, requests a token
restricted to this repository, and revokes it when the command finishes. Credentials
are not printed or stored in Git configuration. Node 22+ and `gh` are required.

```sh
node tools/github/agent.mjs check
node tools/github/agent.mjs git push -u origin my-branch
node tools/github/agent.mjs gh pr create --repo dgaspard/ai-sdlc-specc-bdd-design --base main --head my-branch --title 'Change title' --body-file /tmp/pr-body.md
```

Authenticated Git operations must use the HTTPS origin. SSH remotes use SSH keys
instead of this token. Local commit author identity is separate from PR authorship.
The current App cannot modify workflow files because it has no workflows write permission.

The wrapper prevents personal-token fallback within its invocation; it is not an OS
security boundary. For enforced separation, agent processes must run in an environment
without the maintainer's keychain, personal tokens, SSH keys, or personal-account connectors.

CTL-025 remains awaiting CI-02: its frozen live check currently queries user collaborator
permissions and must be adapted to verify GitHub App installation permissions and bypass
settings before a human removes the awaiting tag and freezes activation.
