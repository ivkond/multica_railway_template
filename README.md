[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/multica?referralCode=YqmMB-&utm_medium=integration&utm_source=template&utm_campaign=generic)

# Multica Railway Template

This repository is a deployable Railway template for [Multica](https://github.com/multica-ai/multica), the upstream open-source managed agents platform.

For product details, feature descriptions, screenshots, CLI reference, and general Multica docs, use the original repository: <https://github.com/multica-ai/multica>.

## What This Repository Is For

Use this repository when you want to deploy a self-hosted Multica stack on Railway from source. It keeps the upstream application code together with Railway service configuration so Railway can build and run the frontend, backend, database, and managed daemon runtime services from one canonical repository.

This template is intentionally deployment-focused. It does not duplicate upstream Multica documentation; it only explains how this repository is organized, how to configure it, and how to operate the Railway deployment.

## Repository Layout

| Path | Purpose |
|------|---------|
| `railway/backend.railway.json` | Railway build/start config for the Go backend service |
| `railway/frontend.railway.json` | Railway build/start config for the Next.js frontend service |
| `railway/daemon/railway.json` | Railway build/start config for Codex/OpenCode daemon runtime services |
| `railway/daemon/` | Dockerfile, scripts, and docs for Railway-hosted daemon runtimes |
| `railway/README.md` | Exact Railway service variables and post-deploy checklist |
| `server/` | Multica backend source |
| `apps/web/` | Multica web frontend source |
| `apps/desktop/` | Desktop app source, not required for Railway deployment |
| `packages/` | Shared frontend packages used by the apps |

## Prerequisites

- Railway account with permission to create projects and services
- GitHub repository connected to Railway
- Infisical project and read-only service tokens for managed daemon runtime secrets
- Local `railway` CLI if you prefer CLI-driven configuration
- Local `multica` CLI for local operation or verification
- Optional local dev tools: Node.js, pnpm, Go, and Docker

## Railway Setup

1. Create a new Railway project from this GitHub repository.
2. Add the base services: `frontend`, `backend`, and `pgvector`.
3. Point `backend` at `/railway/backend.railway.json`.
4. Point `frontend` at `/railway/frontend.railway.json`.
5. Configure `pgvector` with image `pgvector/pgvector:pg17`, private networking, and a persistent volume.
6. Optionally add managed daemon services such as `daemon-opencode` and `daemon-codex`, each using `/railway/daemon/railway.json`.
7. Set backend, frontend, database, and daemon variables from `railway/README.md`.
8. Deploy backend first, then frontend, then daemon services.
9. Open the frontend public domain and complete first login.

See [`railway/README.md`](railway/README.md) for copy-paste service variables, health checks, and required post-deploy steps.

## Required Services

| Service | Runs | Public Networking |
|---------|------|-------------------|
| `frontend` | Next.js web app | Enabled |
| `backend` | Go API, auth, WebSocket, uploads | Enabled |
| `pgvector` | PostgreSQL 17 with pgvector | Disabled; private networking only |
| `daemon-opencode` | OpenCode-backed daemon runtime | Disabled |
| `daemon-codex` | Codex-backed daemon runtime | Disabled |

Keep the backend at one replica if using the Railway volume at `/app/data/uploads` for uploads. Move uploads to object storage before scaling backend replicas.

## Using The Deployment

After Railway deployment succeeds:

1. Open the frontend Railway domain.
2. Log in with an email code. If email delivery is not configured, read the verification code from backend logs.
3. Confirm the Railway daemon services are healthy in Railway and visible in the Multica runtimes UI.
4. Create an agent in the web app, assign an issue, and watch the agent execute on the managed runtime.

You can still connect a local machine with `multica setup self-host --server-url https://<backend-domain> --app-url https://<frontend-domain>` when you need a local runtime.

## Local Development

Use local development only when changing this template or testing upstream code changes before pushing to Railway.

```bash
make dev
```

`make dev` installs dependencies, prepares the database, runs migrations, and starts the backend and frontend for the current checkout.

Useful local checks:

```bash
pnpm typecheck
pnpm test
pnpm lint
make test
```

## Updating From Upstream

This repository should stay close to upstream Multica while keeping Railway-specific files intact.

Recommended update flow:

1. Pull or merge changes from <https://github.com/multica-ai/multica>.
2. Preserve files under `railway/` and this template README.
3. Run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `make test`.
4. Deploy to Railway staging or a temporary project first.
5. Verify login, WebSocket updates, Railway daemon connection, and issue assignment before updating production.

## Verification

Use these checks after deploy:

```bash
curl -sf https://<backend-domain>/health
curl -sf https://<backend-domain>/readyz
curl -I https://<frontend-domain>
curl -I https://<frontend-domain>/docs
```

Expected result: backend health checks return `ok`, frontend responds, docs route loads, Railway daemon services are healthy, and the Multica runtimes UI shows the expected daemon ids online.

## More Information

- Original Multica repository: <https://github.com/multica-ai/multica>
- Railway deployment details: [`railway/README.md`](railway/README.md)
- Railway daemon runtime details: [`railway/daemon/README.md`](railway/daemon/README.md)
- Self-hosting details from upstream codebase: [`SELF_HOSTING.md`](SELF_HOSTING.md)
- Contributor workflow: [`CONTRIBUTING.md`](CONTRIBUTING.md)
