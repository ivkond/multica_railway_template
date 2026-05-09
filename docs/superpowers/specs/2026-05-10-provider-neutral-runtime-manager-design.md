# Provider-Neutral Runtime Manager Design

## Goal

Build a provider-neutral Multica runtime management layer that can provision and reconcile managed daemon runtimes on Railway first, while keeping the domain model portable to Kubernetes, AWS, Yandex Cloud, Cloud.ru, and other long-running container platforms.

## Research Summary

### Multica frontend and official images

Upstream Multica publishes official backend and web images for Docker Compose self-hosting:

- `ghcr.io/multica-ai/multica-backend`
- `ghcr.io/multica-ai/multica-web`

The self-hosting guide documents the image-based path through `make selfhost` and `docker-compose.selfhost.yml`, with `make selfhost-build` as the fallback when a GHCR tag has not been published yet.

Sources:

- https://github.com/multica-ai/multica/blob/main/SELF_HOSTING.md
- https://github.com/multica-ai/multica/blob/main/docker-compose.selfhost.yml
- https://github.com/multica-ai/multica/blob/main/docker-compose.selfhost.build.yml

The current upstream web image is not fully runtime-configurable for arbitrary backend endpoints. `REMOTE_API_URL` is read in `apps/web/next.config.ts`, and the official release workflow builds the web image with `REMOTE_API_URL=http://backend:8080`. The built `.next/routes-manifest.json` then contains backend rewrite destinations produced at build time.

Sources:

- https://github.com/multica-ai/multica/blob/main/apps/web/next.config.ts
- https://github.com/multica-ai/multica/blob/main/Dockerfile.web
- https://github.com/multica-ai/multica/blob/main/.github/workflows/release.yml

Related upstream work:

- https://github.com/multica-ai/multica/pull/231 added `REMOTE_API_URL`, but as build-time proxy configuration.
- https://github.com/multica-ai/multica/pull/1063 removed hardcoded public API and WebSocket defaults from `.env.example`.
- https://github.com/multica-ai/multica/issues/1522 documents that Next.js rewrites do not proxy WebSocket upgrade requests.
- https://github.com/multica-ai/multica/pull/1567 corrected self-hosting WebSocket docs, but did not implement a code-level runtime proxy.

### Next.js runtime configuration

Next.js supports runtime environment access on the server side during dynamic rendering, but `NEXT_PUBLIC_*` variables are inlined into browser bundles during `next build`. Values used in `next.config.ts` rewrites also become part of build output such as route manifests.

Source:

- https://github.com/vercel/next.js/blob/v16.1.6/docs/01-app/02-guides/environment-variables.mdx

### Railway capabilities

Railway can create services from Docker images, set variables, create volumes, inspect service status, and delete services through API and CLI primitives. Railway does not provide Kubernetes-style declarative reconciliation by itself; reconciliation must be implemented by an external controller or operator.

Sources:

- https://docs.railway.com/integrations/api/manage-services
- https://docs.railway.com/integrations/api/manage-volumes
- https://docs.railway.com/integrations/api/api-cookbook
- https://docs.railway.com/cli/add

### Caddy ingress

Caddy supports path-based reverse proxying and WebSocket matching/proxying. A Caddy ingress service can make browser and local CLI traffic same-origin while keeping frontend, backend, database, and daemon services private.

Sources:

- https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- https://caddyserver.com/docs/caddyfile/matchers

## Discussion Record

### Why not only use upstream images directly on Railway?

The backend image can be used directly if its runtime environment is configured correctly. The web image is harder because its internal Next.js rewrites point to the build-time backend URL. This is acceptable for Docker Compose where the backend service hostname is `backend`, but it is fragile for Railway projects where the private backend hostname is service-specific.

The practical workaround is to introduce an ingress service that intercepts browser-visible routes before they reach the Next.js frontend:

- `/api/*` -> backend
- `/auth/*` -> backend
- `/uploads/*` -> backend
- `/ws` -> backend with WebSocket upgrade support
- all other paths -> frontend

This lets browser and local CLI clients use one public origin and avoids relying on Next.js rewrites for WebSocket traffic.

### Should daemon services be routed through Caddy?

Daemon services do not need public inbound networking. They should stay private and connect directly to the backend over the provider private network when they run in the same project or cluster. Their `MULTICA_APP_URL` can still point to the public Caddy URL for task links.

Recommended runtime URLs for Railway-hosted daemons:

- `MULTICA_SERVER_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080`
- `MULTICA_APP_URL=https://${{caddy.RAILWAY_PUBLIC_DOMAIN}}`

This keeps daemon traffic off the public ingress and avoids exposing daemon runtime surfaces.

### How should daemon scaling work?

Daemon runtimes should not be scaled by increasing replicas of one service unless the daemon implementation explicitly supports unique identities and isolated workspace storage per replica. The safer model is one service per daemon instance:

- unique `MULTICA_DAEMON_ID`
- unique service name
- unique `/data` volume
- unique Infisical secret path
- provider-specific deployment handle

Example:

- `daemon-opencode-1`
- `daemon-opencode-2`
- `daemon-codex-1`

### How should dynamic runtime administration work?

Railway can be automated, but it will not reconcile desired state by itself. A Runtime Manager should own desired state and run a reconciler worker that applies changes through a provider adapter.

The admin UI should never create Railway services directly in the request path. It should write desired state and enqueue reconciliation.

## Decision

Use a provider-neutral Runtime Manager with Railway as the first provider adapter.

The first implementation should include:

1. A Caddy public ingress service for browser and local CLI traffic.
2. Private upstream backend and frontend services, preferably using official Multica images when compatible.
3. Private daemon services that connect directly to the backend over private networking.
4. A provider abstraction for runtime lifecycle operations.
5. A Railway provider adapter that provisions one daemon service per runtime instance.
6. Infisical as the initial SecretStore implementation.

The Runtime Manager domain model must not store Railway-specific concepts as core entities. Railway service IDs, volume IDs, and deployment IDs belong in provider handles and observed state.

## Target Architecture

```text
Public clients
  |
  +-- browser
  +-- local multica CLI
        |
        v
      caddy public ingress
        |
        +-- /api, /auth, /uploads, /ws -> backend private
        +-- all other paths            -> frontend private

Provider private network
  |
  +-- daemon-opencode-1 -> backend private
  +-- daemon-opencode-2 -> backend private
  +-- daemon-codex-1    -> backend private
  +-- backend           -> pgvector private

Runtime management
  |
  +-- Admin UI
  +-- Runtime Manager API
  +-- Runtime Reconciler worker
  +-- Provider adapters
  +-- SecretStore adapters
```

## Core Contracts

### RuntimeSpec

`RuntimeSpec` describes the desired daemon instance independent of any provider:

```yaml
runtime_id: brave-vitality-opencode-1
agent: opencode
image: ghcr.io/ivkond/multica-daemon:opencode-v0.2.28
desired_state: running
resources:
  cpu: 1
  memory_mb: 2048
storage:
  mount_path: /data
  size_mb: 10240
network:
  public: false
urls:
  server_url_mode: provider_private_backend
  app_url_mode: public_ingress
secrets:
  store: infisical
  path: /multica-daemon/brave-vitality/opencode-1
labels:
  project: brave-vitality
  environment: production
  managed_by: multica-runtime-manager
```

### RuntimeProvider

Provider adapters implement these operations:

```text
ensureRuntime(spec) -> RuntimeHandle
deleteRuntime(runtime_id, deletion_policy) -> void
getRuntimeStatus(runtime_id) -> RuntimeObservedState
listRuntimes(selector) -> RuntimeObservedState[]
restartRuntime(runtime_id) -> void
updateRuntime(spec) -> RuntimeHandle
```

### SecretStore

Secret adapters implement these operations:

```text
ensureSecretPath(path, values, policy) -> SecretHandle
getSecretMetadata(path) -> SecretMetadata
deleteSecretPath(path, deletion_policy) -> void
rotateSecret(path, key, value) -> SecretHandle
```

### RuntimeRegistry

The Runtime Manager persists:

- desired runtime specs
- observed provider handles
- reconciliation status
- reconciliation events
- deletion and retention policy
- operator audit trail

## Provider Mapping

### RailwayAdapter

Maps one `RuntimeSpec` to:

- Railway service from Docker image
- Railway volume mounted at `/data`
- service variables
- private networking only
- restart policy
- service deployment status

Railway-specific fields stay in `RuntimeHandle`:

```yaml
provider: railway
service_id: service-id
volume_id: volume-id
deployment_id: deployment-id
environment_id: environment-id
project_id: project-id
```

### KubernetesAdapter

Maps one `RuntimeSpec` to:

- Deployment or StatefulSet
- PersistentVolumeClaim
- Secret or ExternalSecret
- ConfigMap for non-secret config
- NetworkPolicy that blocks public ingress
- labels for selection and garbage collection

This adapter should be the second target because it covers private K8S, EKS, Yandex Managed Kubernetes, and Cloud.ru Kubernetes-like platforms.

### AWS Adapter

Likely maps to:

- ECS service or one-off Fargate task family
- EFS for persistent `/data`
- AWS Secrets Manager or external Infisical injection
- CloudWatch logs
- private subnets and security groups

### Yandex Cloud and Cloud.ru Adapters

Preferred first implementation path is their managed Kubernetes offering if available. Direct container platform adapters can be added later only if they support long-running containers, persistent storage, private networking, and managed secrets.

### Vercel

Vercel is not a good target for daemon runtimes because daemons are long-running workers with writable workspaces and persistent agent state. Vercel may host the frontend, but daemon fleets should run on Railway, Kubernetes, ECS/Fargate, or VM/container infrastructure.

## Implementation Plan

### Stage 1: Architecture Documentation and Contracts

**Goal:** document provider-neutral runtime management and lock down contract names before implementation.

**Tasks:**

1. Add this design document.
2. Add a follow-up implementation plan under `docs/superpowers/plans/` before code changes.
3. Review existing daemon runtime docs and align terminology around `RuntimeSpec`, `RuntimeProvider`, `SecretStore`, and `RuntimeRegistry`.

**SMART Definition of Done:**

- The design document exists in `docs/superpowers/specs/`.
- The document names all core contracts and provider mappings.
- The document includes a Railway-first path and a Kubernetes portability path.
- The document includes explicit non-goals for Vercel-hosted daemon runtimes.

**Validation:**

- `git diff --check` passes.
- Manual review confirms there are no unresolved markers, incomplete decisions, or provider-specific leaks in core contracts.

### Stage 2: Caddy Ingress for Railway Template

**Goal:** make the Railway template expose only Caddy publicly while keeping backend and frontend private.

**Tasks:**

1. Add `railway/ingress/` with a Caddy image and Caddyfile.
2. Route `/api/*`, `/auth/*`, `/uploads/*`, and `/ws` to backend.
3. Route all remaining paths to frontend.
4. Update Railway docs and variables to use Caddy as the public app URL.
5. Keep daemon services private and point their server URL to backend private networking.

**SMART Definition of Done:**

- Browser login works through the Caddy public domain.
- WebSocket connection succeeds through `/ws` on the Caddy public domain.
- Local Multica CLI can authenticate against the Caddy public domain.
- Frontend and backend public networking can be disabled without breaking browser usage.
- Railway daemon services can connect to backend over private networking.

**TDD and validation requirements:**

- Add config tests that assert Caddy routes `/api`, `/auth`, `/uploads`, and `/ws` to backend.
- Add docs tests or snapshot checks for required Railway variables if the existing test pattern supports it.
- Run `git diff --check`.
- Run targeted frontend config tests if they exist.
- Manually verify WebSocket upgrade through Caddy in a staging Railway project.

### Stage 3: Runtime Manager Domain Model

**Goal:** introduce provider-neutral runtime desired state and observed state without depending on Railway types.

**Tasks:**

1. Define `RuntimeSpec`, `RuntimeHandle`, `RuntimeObservedState`, and reconciliation event types.
2. Define `RuntimeProvider` and `SecretStore` interfaces.
3. Add storage for desired and observed state.
4. Add validation rules for daemon identity, image, storage, network mode, and secret path.

**SMART Definition of Done:**

- Core runtime management code does not import Railway SDK, Railway CLI wrappers, or Railway-specific DTOs.
- Runtime IDs are unique per project and environment.
- Each daemon instance requires a unique secret path and unique storage mount.
- Invalid specs fail before any provider call is made.

**TDD and validation requirements:**

- Write contract tests for `RuntimeProvider` behavior before the Railway adapter implementation.
- Write validation tests for duplicate runtime IDs, missing secret paths, invalid image references, and public daemon networking.
- Keep provider mocks limited to external API boundaries.

### Stage 4: Railway Provider Adapter

**Goal:** reconcile `RuntimeSpec` into Railway services, volumes, variables, and deployments.

**Tasks:**

1. Implement `RailwayAdapter.ensureRuntime`.
2. Implement `RailwayAdapter.deleteRuntime`.
3. Implement `RailwayAdapter.getRuntimeStatus`.
4. Implement idempotency by matching managed labels, names, or persisted provider handles.
5. Persist Railway service, volume, and deployment IDs in provider handles.

**SMART Definition of Done:**

- Applying the same spec twice does not create duplicate services or volumes.
- Increasing `opencode.count` from 1 to 2 creates exactly one additional runtime service.
- Decreasing `opencode.count` from 2 to 1 marks one runtime for deletion according to deletion policy.
- Railway API failures are recorded as reconciliation events with retryable status.
- Service variables do not expose provider tokens or agent credentials in logs.

**TDD and validation requirements:**

- Write adapter contract tests with a fake Railway API client.
- Write idempotency tests for create, update, and delete flows.
- Write failure tests for partial creation: service created but volume creation failed, variables failed after volume creation, redeploy failed after variables.
- Run static checks for the implementation language used.

### Stage 5: Infisical SecretStore Adapter

**Goal:** manage daemon secret paths without hard-coding Infisical into the runtime domain model.

**Tasks:**

1. Implement `InfisicalSecretStore.ensureSecretPath`.
2. Implement metadata lookup and deletion policy.
3. Support required daemon keys: `MULTICA_TOKEN`, optional `GITHUB_TOKEN`, and agent-specific auth material such as `CODEX_AUTH_JSON_B64`.
4. Keep provider API tokens separate from runtime credentials.

**SMART Definition of Done:**

- Runtime Manager can create or validate a secret path before creating a daemon service.
- Missing required secrets block daemon provisioning with an actionable status.
- Secret deletion policy is explicit: retain, archive, or delete.
- No secret values are written to reconciliation events.

**TDD and validation requirements:**

- Write SecretStore contract tests with a fake Infisical API client.
- Write tests for missing required keys, metadata-only reads, and delete retention policy.
- Verify logs and events redact secret values.

### Stage 6: Runtime Reconciler Worker

**Goal:** asynchronously converge desired runtime fleet state to provider state.

**Tasks:**

1. Add reconciliation queue or scheduled worker.
2. Reconcile desired runtime specs to provider observed state.
3. Write reconciliation events and status.
4. Add retry behavior with bounded backoff.
5. Add operator-visible status: pending, creating, running, degraded, deleting, deleted, failed.

**SMART Definition of Done:**

- Admin UI changes only desired state.
- Reconciler creates, updates, and deletes daemon services without blocking UI requests.
- Every provider operation produces an audit event.
- Failed operations retry without duplicating services.
- Runtime status reflects both provider deployment status and daemon registration status in Multica backend.

**TDD and validation requirements:**

- Write integration-style reconciler tests using fake Provider and SecretStore implementations.
- Test create, scale up, scale down, failed create, retry, and delete retention flows.
- Add tests for daemon registration timeout and degraded state.

### Stage 7: Admin UI and API

**Goal:** provide an operator UI for selecting runtime fleets per project and environment.

**Tasks:**

1. Add runtime catalog display for supported agents.
2. Add count controls per agent type.
3. Show desired state, observed state, last reconciliation error, and provider handles.
4. Require confirmation for destructive scale-down and volume deletion.
5. Expose safe API endpoints for desired-state changes only.

**SMART Definition of Done:**

- Operator can configure `opencode+codex`, `opencode only`, or all supported runtimes.
- UI never accepts raw Railway service IDs as primary user input.
- Deleting a runtime requires explicit deletion policy selection.
- UI shows when a runtime is provisioned but not yet registered in Multica.

**TDD and validation requirements:**

- Add API contract tests for desired-state updates.
- Add UI tests for count changes, confirmation flows, and status rendering.
- Add authorization tests so only admins can mutate runtime fleet state.

### Stage 8: Kubernetes Adapter Design Spike

**Goal:** validate that the provider abstraction works beyond Railway before the Railway adapter becomes entrenched.

**Tasks:**

1. Map `RuntimeSpec` to Kubernetes Deployment or StatefulSet.
2. Map storage to PVC.
3. Map secrets to Secret or ExternalSecret.
4. Map status from Kubernetes pod conditions and daemon backend registration.
5. Document differences between Railway and Kubernetes semantics.

**SMART Definition of Done:**

- A Kubernetes adapter design document exists.
- The design identifies which existing RuntimeProvider methods are sufficient.
- Any missing provider capabilities are captured as explicit contract changes.
- No Railway-specific assumption is required by the Kubernetes mapping.

**TDD and validation requirements:**

- Add adapter contract tests that can be reused by Railway and Kubernetes implementations.
- Add a fake Kubernetes provider test case that proves the core reconciler is provider-neutral.

## Edge Cases and Policies

### Partial provisioning

If service creation succeeds but volume or variables fail, the reconciler must record a partial state and retry the missing step. It must not create another service with the same runtime ID.

### Deletion

Runtime deletion must support three policies:

- `retain_storage`: stop and delete compute, keep persistent volume or provider equivalent.
- `delete_storage`: delete compute and storage after explicit confirmation.
- `archive_storage`: move workspace data to a configured archive target when the provider supports it.

### Secret rotation

Secret rotation should update SecretStore first, then restart the runtime service. Failed restarts keep the previous observed state and mark the runtime degraded.

### Provider token safety

The Runtime Manager's provider API token is an infrastructure credential. It must not be stored in daemon secret paths and must not be exposed to daemon containers.

### Daemon identity collision

Two running daemon instances must never share the same `MULTICA_DAEMON_ID`. Validation must reject duplicate IDs before provider calls.

### Cost control

Admin UI must show the number of daemon services to be created before applying changes. Runtime Manager should support project-level maximum counts per agent type.

## Initial Non-Goals

- Running daemon workloads on Vercel.
- Autoscaling daemon services per task.
- A generic marketplace for arbitrary agent images.
- Provider-specific advanced tuning before Railway and Kubernetes contracts are stable.
- Replacing Infisical before the SecretStore abstraction exists.

## Open Decisions Resolved for Initial Implementation

- Use Caddy, not Traefik, for the first Railway ingress because the routing needs are simple and do not require dynamic discovery.
- Use one service per daemon instance, not one scaled service with multiple replicas.
- Keep daemon services private and connect them directly to backend over private networking.
- Treat Railway as the first provider adapter, not as a core domain dependency.
- Treat Kubernetes as the second provider target for portability validation.
