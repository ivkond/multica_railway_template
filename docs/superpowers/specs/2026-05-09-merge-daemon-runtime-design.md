# Merge Daemon Runtime Into Railway Template Design

Date: 2026-05-09

## Goal

Make `ivkond/multica_railway_template` the single canonical Railway deployment repository for the full self-hosted Multica stack, including backend, frontend, pgvector, and managed daemon runtimes.

The separate `ivkond/multica-daemon` repository becomes a temporary source artifact only. After the daemon runtime is merged and verified in the template repository, that repository should be archived or replaced with a redirect README.

## Context

`ivkond/multica_railway_template` already contains the upstream Multica source tree and Railway configs for:

- `backend`, built by `Dockerfile` with `/railway/backend.railway.json`;
- `frontend`, built by `Dockerfile.web` with `/railway/frontend.railway.json`;
- `pgvector`, configured as a Railway image service.

`ivkond/multica-daemon` currently contains the cloud daemon runtime:

- a dedicated daemon Dockerfile;
- Railway healthcheck config;
- startup scripts for Infisical, Multica CLI, Codex, OpenCode, GitHub credentials, persistent `/data` state, and a health proxy.

Keeping these as two deployment repositories creates operational drift: backend/frontend changes are deployed from one repo, while daemon changes are deployed from another. Railway services also need cross-repo wiring, which makes source settings, branch settings, and deploy history harder to reason about.

## Decision

Move the daemon runtime into `ivkond/multica_railway_template` under `railway/daemon/`.

The canonical layout will be:

```text
railway/
  backend.railway.json
  frontend.railway.json
  daemon/
    Dockerfile
    railway.json
    README.md
    scripts/
      entrypoint.sh
      health_proxy.py
      setup_agent.sh
      setup_multica.sh
```

The daemon Railway service will use config file path:

```text
/railway/daemon/railway.json
```

`railway/daemon/railway.json` will point at:

```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "railway/daemon/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health"
  }
}
```

The daemon Dockerfile will copy scripts from `railway/daemon/scripts/`.

## Runtime Services

The Railway project should contain these service classes:

| Service | Source | Purpose | Public networking | Volume |
| --- | --- | --- | --- | --- |
| `backend` | this repo, `/railway/backend.railway.json` | Go API, auth, WebSocket, uploads | enabled | optional backend uploads volume |
| `frontend` | this repo, `/railway/frontend.railway.json` | Next.js UI | enabled | none |
| `pgvector` | `pgvector/pgvector:pg17` image | PostgreSQL with pgvector | disabled | required at `/var/lib/postgresql/data` |
| `daemon-opencode` | this repo, `/railway/daemon/railway.json` | OpenCode runtime worker | optional; healthcheck only | required at `/data` |
| `daemon-codex` | this repo, `/railway/daemon/railway.json` | Codex runtime worker | optional; healthcheck only | required at `/data` |

Each daemon runtime is one Railway service with one Railway volume and one stable daemon identity.

## Daemon Secrets

Infisical remains the central runtime secret store.

Railway stores only bootstrap and non-secret service configuration:

```dotenv
AGENT=opencode
INFISICAL_TOKEN=railway_sealed_infisical_token
INFISICAL_PROJECT_ID=<project-id>
INFISICAL_ENV=prod
INFISICAL_SECRET_PATH=/multica-daemon/agent-opencode-1
INFISICAL_API_URL=https://eu.infisical.com/api
MULTICA_SERVER_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}
MULTICA_APP_URL=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
MULTICA_DAEMON_ID=agent-opencode-1
MULTICA_DAEMON_DEVICE_NAME=agent-opencode-1
MULTICA_AGENT_RUNTIME_NAME=OpenCode Runtime 1
MULTICA_WORKSPACES_ROOT=/data/workspaces
PORT=8080
LOG_LEVEL=info
```

Infisical stores runtime credentials:

```dotenv
MULTICA_TOKEN=mul_runtime_token
GITHUB_TOKEN=github_token_with_repo_read_access
CODEX_AUTH_JSON_B64=base64_encoded_codex_auth_json
```

`CODEX_AUTH_JSON_B64` is required only for `AGENT=codex`. `GITHUB_TOKEN` is optional and is used only for private GitHub HTTPS clones.

## Persistence

Daemon services must mount a Railway volume at `/data`.

The runtime uses `/data` for:

- `/data/workspaces`: cloned task repositories and task worktrees;
- `/data/home`: managed home directory, `.netrc`, and `.git-credentials`;
- `/data/codex`: Codex subscription auth state;
- `/data/opencode`: OpenCode runtime state.

Startup must reject `MULTICA_WORKSPACES_ROOT` values that are outside `/data` or overlap `/data/home`, `/data/codex`, or `/data/opencode`.

## GitHub Credentials

When `GITHUB_TOKEN` exists in Infisical, daemon startup creates:

- `/data/home/.netrc`;
- `/data/home/.git-credentials`;
- a global Git `credential.helper` pointing to the managed credential store.

The startup process unsets `GITHUB_TOKEN` and `GITHUB_TOKEN_FROM_SECRET_STORE` before launching `multica daemon start --foreground`.

When `GITHUB_TOKEN` is removed from Infisical, startup removes the managed credential files and unsets the Git credential helper.

## Logging

Startup logs must not print:

- `INFISICAL_TOKEN`;
- `MULTICA_TOKEN`;
- `GITHUB_TOKEN`;
- `CODEX_AUTH_JSON_B64`;
- decoded Codex `auth.json`;
- raw Infisical export JSON;
- Multica token prefixes from `multica auth status`.

The daemon setup must treat successful `multica login --token` completion as the authentication gate and must not run `multica auth status` during startup.

## Documentation Updates

The root `README.md` should describe the repository as a complete Railway stack, not only a backend/frontend template.

`railway/README.md` should document:

- backend variables;
- frontend variables;
- pgvector variables;
- daemon-opencode variables;
- daemon-codex variables;
- volume requirements;
- Infisical path conventions;
- post-deploy verification for backend, frontend, and daemon runtimes.

`railway/daemon/README.md` should contain daemon-specific build args, variables, secret shape, troubleshooting, and local Docker build commands.

## Non-Goals

This merge will not change upstream Multica application behavior.

It will not introduce a credential broker service.

It will not move backend/frontend secrets into Infisical. Backend and frontend keep their current Railway variable model.

It will not automate Railway service creation with Railway Agent or other paid automation.

It will not add new runtime providers beyond Codex and OpenCode.

## Migration Plan

1. Create a branch in `ivkond/multica_railway_template`.
2. Copy daemon runtime files from `ivkond/multica-daemon` commit `873c403d5db701339f23ecb4bbf5fe65043271b7`.
3. Move copied files into `railway/daemon/`.
4. Update daemon paths in Dockerfile and Railway config.
5. Update root and Railway docs.
6. Run static validation:
   - `git diff --check`;
   - `bash -n railway/daemon/scripts/entrypoint.sh`;
   - `bash -n railway/daemon/scripts/setup_agent.sh`;
   - `bash -n railway/daemon/scripts/setup_multica.sh`;
   - Python compile check for `railway/daemon/scripts/health_proxy.py` when Python is available.
7. Optionally build one daemon image locally or in Railway.
8. Switch Railway daemon services to `ivkond/multica_railway_template` with config path `/railway/daemon/railway.json`.
9. After production verification, archive or redirect `ivkond/multica-daemon`.

## Definition Of Done

The merge is complete when all of these are true:

- `ivkond/multica_railway_template` contains daemon runtime files under `railway/daemon/`.
- `railway/daemon/railway.json` builds from `railway/daemon/Dockerfile`.
- Existing backend and frontend Railway configs remain unchanged except documentation references.
- Daemon startup still supports both `AGENT=codex` and `AGENT=opencode`.
- Daemon startup fetches `MULTICA_TOKEN`, optional `GITHUB_TOKEN`, and Codex-only `CODEX_AUTH_JSON_B64` from Infisical.
- Runtime state is persisted only under `/data`.
- Startup does not print secret values or Multica token prefixes.
- Static validation commands pass or any local tool absence is explicitly recorded.
- Railway daemon services can be switched to the template repo without changing backend, frontend, or pgvector services.
- `ivkond/multica-daemon` is no longer needed as an active deployment source.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Railway resolves daemon Dockerfile paths relative to repo root differently than expected | Use `/railway/daemon/railway.json` with explicit `dockerfilePath: "railway/daemon/Dockerfile"` and verify in Railway before disabling old services |
| Daemon build context becomes larger because it is now the full Multica repo | Keep daemon Dockerfile copies scoped to `railway/daemon/scripts/`; accept larger context for MVP unless Railway build time becomes material |
| Upstream Multica updates overwrite deployment docs | Keep all daemon-specific files under `railway/daemon/` and preserve `railway/` during upstream merges |
| Secrets leak through startup logs | Do not run `multica auth status`; keep `set +x`; unset secrets before daemon launch |
| Existing Railway daemon volume is accidentally replaced | Reuse the existing daemon service volume mounted at `/data`; only change service source repository and config path |

## Alternatives Considered

### Keep Two Repositories

This keeps the current state. It has the least immediate change, but leaves source settings, docs, and deployment history split across two repositories.

### Make `multica-daemon` The Canonical Repository

This would require moving the full upstream Multica application into the daemon repository. It works technically, but the repository name and existing content are misleading for backend/frontend ownership.

### Use Git Submodules

A submodule could embed daemon runtime files without copying them. This adds operational complexity in Railway builds and keeps the cross-repository dependency that this merge is intended to remove.

## Recommended Implementation Style

Use a copy-and-move merge, not a rewrite:

- preserve daemon runtime behavior from commit `873c403d5db701339f23ecb4bbf5fe65043271b7`;
- change paths only where required by the new repository layout;
- update documentation in the same branch;
- validate before switching Railway service source settings.
