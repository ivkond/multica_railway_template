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
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "railway/daemon/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "requiredMountPath": "/data"
  }
}
```

The daemon Dockerfile will copy scripts from `railway/daemon/scripts/`, not from the old source-repo `scripts/` path.

`requiredMountPath` is an expected Railway config guard for daemon services. It does not create the Railway volume by itself; operators still must attach one volume per daemon service at `/data`.

The MVP daemon build target is `linux/amd64`. The copied Dockerfile currently downloads `node-v${NODE_VERSION}-linux-x64.tar.xz` and `multica_linux_amd64.tar.gz`, so Railway daemon services must build and run on `linux/amd64` until the Dockerfile maps `TARGETARCH` consistently for Node.js and Multica release assets. `linux/arm64` support can be added later by introducing explicit asset mapping and checksum validation for every downloaded binary.

## Runtime Services

The Railway project should contain these service classes:

| Service | Source | Purpose | Public networking | Volume |
| --- | --- | --- | --- | --- |
| `backend` | this repo, `/railway/backend.railway.json` | Go API, auth, WebSocket, uploads | enabled | production uploads volume at `/app/data/uploads` |
| `frontend` | this repo, `/railway/frontend.railway.json` | Next.js UI | enabled | none |
| `pgvector` | `pgvector/pgvector:pg17` image | PostgreSQL with pgvector | disabled | required at `/var/lib/postgresql/data` |
| `daemon-opencode` | this repo, `/railway/daemon/railway.json` | OpenCode runtime worker | disabled | required at `/data` |
| `daemon-codex` | this repo, `/railway/daemon/railway.json` | Codex runtime worker | disabled | required at `/data` |

Each daemon runtime is one Railway service with one Railway volume and one stable daemon identity.

Daemon public networking is disabled by default because Railway can run the `/health` healthcheck without assigning a public domain. Enable public networking only when operators need direct external health inspection or a temporary diagnostics endpoint; the tradeoff is a publicly reachable daemon container surface, so the endpoint must remain health-only and must not expose daemon control operations.

Backend upload persistence uses a Railway volume mounted at `/app/data/uploads` for production deployments of this template. Object storage can replace that later, but the current supported persistence mode is the backend volume and must be documented in `railway/README.md`.

## Daemon Build Variables

Daemon build variables are configured per daemon service and are separate from runtime variables. They must be present before the Railway build starts because the Dockerfile validates build args and downloads agent-specific binaries during image build.

Common build variable names required for every daemon image:

```dotenv
AGENT=codex_or_opencode
MULTICA_VERSION=v0.2.27
NODE_VERSION=22.15.0
PNPM_VERSION=10.10.0
INFISICAL_CLI_VERSION=0.43.82
```

Complete `daemon-opencode` build variables:

```dotenv
AGENT=opencode
MULTICA_VERSION=v0.2.27
NODE_VERSION=22.15.0
PNPM_VERSION=10.10.0
INFISICAL_CLI_VERSION=0.43.82
OPENCODE_VERSION=1.14.41
OPENCODE_SHA256_X64=d27d3c85183a7bd2df4506484a2f508d1897962063b7ccc8466705b493963dc5
OPENCODE_SHA256_ARM64=2ffa63bb6115d7aa193cb1f6fa766eb79e1b399776871a624935a752e4461105
```

Complete `daemon-codex` build variables:

```dotenv
AGENT=codex
MULTICA_VERSION=v0.2.27
NODE_VERSION=22.15.0
PNPM_VERSION=10.10.0
INFISICAL_CLI_VERSION=0.43.82
CODEX_VERSION=0.128.0
```

`railway/README.md` must include these copy-paste blocks under separate `daemon-opencode` and `daemon-codex` build-variable sections. `railway/daemon/README.md` must repeat them with the local Docker build commands.

## Daemon Runtime Variables And Secrets

Infisical remains the central runtime secret store.

Railway stores only bootstrap and non-secret runtime configuration. Runtime `AGENT` must match the image build `AGENT`.

Default Infisical SaaS API URL:

```dotenv
INFISICAL_API_URL=https://app.infisical.com/api
```

This deployment uses the Infisical EU region, so daemon runtime variables must explicitly override the default:

```dotenv
INFISICAL_API_URL=https://eu.infisical.com/api
```

Complete `daemon-opencode` runtime variables:

```dotenv
AGENT=opencode
INFISICAL_TOKEN=railway_sealed_infisical_token
INFISICAL_PROJECT_ID=infisical_project_id
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

Complete `daemon-codex` runtime variables:

```dotenv
AGENT=codex
INFISICAL_TOKEN=railway_sealed_infisical_token
INFISICAL_PROJECT_ID=infisical_project_id
INFISICAL_ENV=prod
INFISICAL_SECRET_PATH=/multica-daemon/agent-codex-1
INFISICAL_API_URL=https://eu.infisical.com/api
MULTICA_SERVER_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}
MULTICA_APP_URL=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
MULTICA_DAEMON_ID=agent-codex-1
MULTICA_DAEMON_DEVICE_NAME=agent-codex-1
MULTICA_AGENT_RUNTIME_NAME=Codex Runtime 1
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
- daemon-opencode build variables and runtime variables as separate sections;
- daemon-codex build variables and runtime variables as separate sections;
- volume requirements;
- daemon public networking disabled by default;
- Infisical path conventions;
- post-deploy verification for backend, frontend, and daemon runtimes.

`railway/daemon/README.md` should contain daemon-specific build args, runtime variables, secret shape, troubleshooting, mandatory `linux/amd64` Docker build commands, and the script copy path requirement.

## Non-Goals

This merge will not change upstream Multica application behavior.

It will not introduce a credential broker service.

It will not move backend/frontend secrets into Infisical. Backend and frontend keep their current Railway variable model.

It will not automate Railway service creation with Railway Agent or other paid automation.

It will not add new runtime providers beyond Codex and OpenCode.

## Migration Plan

1. Create a branch in `ivkond/multica_railway_template`.
2. Copy daemon runtime files from `ivkond/multica-daemon` commit `873c403d5db701339f23ecb4bbf5fe65043271b7`.
3. Before editing paths, verify the copied files match the source commit:
   - either run `git diff --no-index` between each source daemon file and its copied template file;
   - or create a SHA-256 manifest for the source files and verify the copied files against it.
4. Move copied files into `railway/daemon/`.
5. Patch daemon paths in Dockerfile and Railway config:
   - `railway/daemon/railway.json` uses `dockerfilePath: "railway/daemon/Dockerfile"`;
   - `railway/daemon/railway.json` includes `requiredMountPath: "/data"`;
   - Dockerfile legacy `COPY scripts/` statements become explicit copy statements under `railway/daemon/scripts/`.
6. Verify the path patch:
   - `rg 'COPY scripts/' railway/daemon/Dockerfile` returns no matches;
   - `rg 'COPY railway/daemon/scripts/(entrypoint.sh|setup_multica.sh|setup_agent.sh|health_proxy.py)' railway/daemon/Dockerfile` finds all four copied runtime files.
7. Update root and Railway docs:
   - root `README.md` describes the full Railway stack;
   - `railway/README.md` documents daemon build variables separately from runtime variables;
   - `railway/README.md` documents daemon public networking as disabled by default;
   - `railway/README.md` documents daemon volumes at `/data` and backend uploads persistence at `/app/data/uploads`;
   - `railway/daemon/README.md` includes the copy-paste build-variable blocks and local Docker build commands.
8. Run static validation:
   - `git diff --check`;
   - `bash -n railway/daemon/scripts/entrypoint.sh`;
   - `bash -n railway/daemon/scripts/setup_agent.sh`;
   - `bash -n railway/daemon/scripts/setup_multica.sh`;
   - Python compile check for `railway/daemon/scripts/health_proxy.py` when Python is available.
9. Run mandatory Docker build validation from the template repo root. Static checks are not sufficient because the daemon Dockerfile downloads architecture-specific runtime binaries.

   `daemon-opencode`:

   ```bash
   docker build --platform linux/amd64 -f railway/daemon/Dockerfile \
     --build-arg AGENT=opencode \
     --build-arg MULTICA_VERSION=v0.2.27 \
     --build-arg NODE_VERSION=22.15.0 \
     --build-arg PNPM_VERSION=10.10.0 \
     --build-arg INFISICAL_CLI_VERSION=0.43.82 \
     --build-arg OPENCODE_VERSION=1.14.41 \
     --build-arg OPENCODE_SHA256_X64=d27d3c85183a7bd2df4506484a2f508d1897962063b7ccc8466705b493963dc5 \
     --build-arg OPENCODE_SHA256_ARM64=2ffa63bb6115d7aa193cb1f6fa766eb79e1b399776871a624935a752e4461105 \
     -t multica-daemon:opencode .
   ```

   `daemon-codex`:

   ```bash
   docker build --platform linux/amd64 -f railway/daemon/Dockerfile \
     --build-arg AGENT=codex \
     --build-arg MULTICA_VERSION=v0.2.27 \
     --build-arg NODE_VERSION=22.15.0 \
     --build-arg PNPM_VERSION=10.10.0 \
     --build-arg INFISICAL_CLI_VERSION=0.43.82 \
     --build-arg CODEX_VERSION=0.128.0 \
     -t multica-daemon:codex .
   ```

   If local Docker is unavailable, run equivalent Railway builds for both services and capture the successful build logs in the merge evidence.
10. Switch Railway daemon services to `ivkond/multica_railway_template` with config path `/railway/daemon/railway.json`, `linux/amd64` build/runtime architecture, public networking disabled, and volumes mounted at `/data`.
11. Run post-merge Railway verification:
   - `backend` deploy is healthy and still reaches pgvector;
   - `frontend` deploy is healthy and points at the backend public domain;
   - `daemon-opencode` Railway deployment is healthy via `/health`;
   - `daemon-codex` Railway deployment is healthy via `/health`;
   - daemon logs show successful Infisical bootstrap and `multica daemon start --foreground`;
   - Multica backend reports the expected daemon IDs, matching `agent-opencode-1` and `agent-codex-1`.
12. After production verification, archive or redirect `ivkond/multica-daemon`.

## Definition Of Done

The merge is complete when all of these are true:

- `ivkond/multica_railway_template` contains daemon runtime files under `railway/daemon/`.
- `railway/daemon/railway.json` builds from `railway/daemon/Dockerfile`.
- `railway/daemon/railway.json` declares `requiredMountPath: "/data"`.
- The daemon Dockerfile contains script copy paths under `railway/daemon/scripts/` and no old `COPY scripts/` paths.
- Daemon build and runtime architecture is explicitly `linux/amd64` for MVP.
- Existing backend and frontend Railway configs remain unchanged except documentation references.
- Daemon startup still supports both `AGENT=codex` and `AGENT=opencode`.
- `daemon-opencode` and `daemon-codex` each have documented build-variable blocks separate from runtime-variable blocks.
- Daemon startup fetches `MULTICA_TOKEN`, optional `GITHUB_TOKEN`, and Codex-only `CODEX_AUTH_JSON_B64` from Infisical.
- Runtime state is persisted only under `/data`.
- Backend uploads production persistence is documented as a Railway volume at `/app/data/uploads`.
- Daemon public networking is disabled by default, with the enablement tradeoff documented.
- Startup does not print secret values or Multica token prefixes.
- Static validation commands pass or any local tool absence is explicitly recorded.
- Docker build validation passes for both `daemon-opencode` and `daemon-codex`, either locally with `--platform linux/amd64` or in Railway with captured successful build logs.
- Railway daemon services are switched to the template repo without changing backend, frontend, or pgvector services.
- Post-merge Railway verification confirms `backend`, `frontend`, `daemon-opencode`, and `daemon-codex` deployments are healthy, and Multica reports the expected daemon IDs.
- `ivkond/multica-daemon` is no longer needed as an active deployment source.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Railway resolves daemon Dockerfile paths relative to repo root differently than expected | Use `/railway/daemon/railway.json` with explicit `dockerfilePath: "railway/daemon/Dockerfile"` and verify in Railway before disabling old services |
| Daemon build context becomes larger because it is now the full Multica repo | Keep daemon Dockerfile copies scoped to `railway/daemon/scripts/`; accept larger context for MVP unless Railway build time becomes material |
| Daemon image is built for the wrong CPU architecture | Require `linux/amd64` for MVP and validate both daemon image builds with `--platform linux/amd64` or equivalent Railway build settings |
| Railway volume is not attached even though config exists | Keep `requiredMountPath: "/data"` in daemon config and verify each daemon service has a mounted `/data` volume before production traffic |
| Public daemon domain exposes unnecessary attack surface | Keep daemon public networking disabled by default and rely on Railway healthchecks plus backend-visible daemon status for verification |
| Backend uploads are lost on redeploy | Document `/app/data/uploads` as the supported production backend volume path |
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
