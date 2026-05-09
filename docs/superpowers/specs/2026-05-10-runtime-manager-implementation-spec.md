<!-- generated-by: gsd-doc-writer -->
# Runtime Manager Implementation Spec

Date: 2026-05-10

Status: implementation-ready for Railway MVP

## Goal

Runtime Manager MUST provide a provider-neutral management layer for Multica daemon runtimes. The first provider adapter MUST be `RailwayAdapter`; the second provider adapter SHOULD be `KubernetesAdapter` to validate portability beyond Railway. Railway MVP MUST expose a single public Caddy ingress, keep backend, frontend, database, and daemon services private, and provision one provider service per daemon instance.

## Context

Multica daemon runtimes are long-running workers with writable workspace state, stable daemon identity, provider credentials, and secret bootstrap requirements. Railway can create image-based services, volumes, variables, deployments, and private network links, but it does not provide Kubernetes-style desired-state reconciliation by itself. Runtime Manager therefore owns desired state, observed state, provider handles, reconciliation events, and deletion policy.

The upstream Multica backend image can run from runtime configuration. The upstream web image is more constrained because Next.js rewrites are produced during build, and browser WebSocket upgrades are not reliably handled by Next.js rewrites. Railway MVP MUST use Caddy as the public ingress that routes API, auth, uploads, and WebSocket traffic to the private backend while routing all remaining browser traffic to the private frontend.

Daemon services MUST stay private. A daemon hosted in the same Railway project SHOULD use the backend private domain for `MULTICA_SERVER_URL` and the Caddy public domain for `MULTICA_APP_URL`. Runtime Manager MUST not model Railway service IDs, Railway volume IDs, or Railway deployment IDs as domain entities; those identifiers belong only in provider handles and observed provider state.

## Scope

This specification covers:

- provider-neutral `RuntimeSpec`, `RuntimeHandle`, `RuntimeObservedState`, reconciliation status, reconciliation events, and registry ownership;
- `RuntimeProvider` contract for provider lifecycle operations;
- `SecretStore` contract for secret path validation, metadata, rotation, and deletion policy;
- asynchronous reconciliation lifecycle from desired state to provider state;
- Railway MVP mapping with `RailwayAdapter`, Caddy public ingress, private backend/frontend/daemon services, and one service per daemon instance;
- future mapping for `KubernetesAdapter` and other long-running container providers;
- security, failure handling, validation scenarios, and implementation acceptance criteria.

## Non-Goals

- Runtime Manager MUST NOT run daemon workloads on Vercel.
- Runtime Manager MUST NOT scale daemon capacity by increasing replicas of a single daemon service unless a later daemon contract proves unique identity and isolated storage per replica.
- Runtime Manager MUST NOT expose Railway service IDs, volume IDs, or deployment IDs as primary user input.
- Admin UI and Runtime Manager API MUST NOT create, update, or delete provider services directly in the request path.
- Railway MVP MUST NOT replace Infisical as the first `SecretStore` implementation.
- Railway MVP MUST NOT implement a generic marketplace for arbitrary agent images.
- Railway MVP MUST NOT add provider-specific advanced tuning before the Railway and Kubernetes contracts are stable.
- This specification does not change upstream Multica backend, frontend, or daemon behavior.

## Actors

| Actor | Responsibility |
| --- | --- |
| Operator | Chooses desired daemon fleet shape, reviews status, and confirms destructive actions. |
| Admin UI | Presents runtime catalog, counts, desired state, observed state, errors, and deletion policy choices. |
| Runtime Manager API | Accepts desired-state changes, validates input, persists specs, and enqueues reconciliation. |
| Runtime Reconciler Worker | Converges desired state to provider state through provider and secret adapters. |
| RuntimeRegistry | Persists desired specs, provider handles, observed state, reconciliation events, deletion policy, and audit trail. |
| RuntimeProvider | Implements provider lifecycle operations without leaking provider-specific DTOs into the domain model. |
| RailwayAdapter | First `RuntimeProvider`; maps one `RuntimeSpec` to one Railway daemon service, one volume, service variables, and deployment status. |
| KubernetesAdapter | Second `RuntimeProvider` target; validates portability through Kubernetes workloads, PVCs, secrets, config, and network policy. |
| SecretStore | Manages daemon secret paths and metadata without exposing secret values to the runtime domain. |
| InfisicalSecretStore | First `SecretStore`; validates and rotates Infisical secret paths for daemon runtimes. |
| Caddy Ingress | Only public service in Railway MVP; routes browser and local CLI traffic to private frontend and backend services. |
| Multica Backend | Receives daemon registration and handles API, auth, uploads, and WebSocket traffic. |
| Daemon Runtime | Private long-running worker with stable identity, mounted `/data` storage, and agent-specific credentials. |

## User Stories

### US-001: Configure daemon fleet

As an operator, I want to set desired counts for supported daemon agents per project and environment, so Runtime Manager can provision the requested fleet without manual Railway service creation.

Acceptance:

- The operator MAY choose `opencode`, `codex`, or both supported agents.
- Runtime Manager MUST convert each requested daemon instance into a unique `RuntimeSpec`.
- Runtime Manager MUST reject duplicate runtime identities before calling any provider adapter.

### US-002: Provision Railway daemon runtime

As an operator, I want Runtime Manager to create a Railway daemon runtime from a desired spec, so each daemon receives isolated compute, storage, identity, and secrets.

Acceptance:

- `RailwayAdapter` MUST create or reuse exactly one Railway service per runtime ID.
- `RailwayAdapter` MUST create or reuse exactly one Railway volume mounted at `/data` per runtime ID.
- Applying the same `RuntimeSpec` twice MUST NOT create duplicate services or volumes.

### US-003: Keep public ingress simple

As a browser or local CLI user, I want one public origin, so API, auth, uploads, WebSocket, and frontend traffic work without exposing internal services.

Acceptance:

- Caddy MUST be the only public ingress service in Railway MVP.
- `/api/*`, `/auth/*`, `/uploads/*`, and `/ws` MUST route to the private backend.
- All other paths MUST route to the private frontend.
- WebSocket upgrade requests to `/ws` MUST reach the backend.

### US-004: Scale fleet safely

As an operator, I want to increase or decrease daemon counts, so runtime capacity changes without identity collisions or accidental storage deletion.

Acceptance:

- Increasing `opencode` from one to two instances MUST create exactly one additional runtime spec and one additional provider service.
- Decreasing `opencode` from two to one instances MUST select one runtime for deletion using an explicit deletion policy.
- `delete_storage` MUST require explicit operator confirmation.

### US-005: Observe reconciliation status

As an operator, I want to see desired state, provider state, daemon registration state, and last errors, so I can diagnose provisioning problems.

Acceptance:

- Runtime Manager MUST expose statuses from the controlled set: `pending`, `creating`, `running`, `degraded`, `deleting`, `deleted`, `failed`.
- Runtime Manager MUST record every provider operation as an audit event.
- Runtime Manager MUST redact secret values from events, errors, and logs.

### US-006: Rotate daemon secret

As an operator, I want to rotate a daemon secret, so the runtime uses new credentials without provider token exposure.

Acceptance:

- Secret rotation MUST update `SecretStore` before restarting the runtime.
- A failed restart MUST keep the previous observed provider state and mark the runtime `degraded`.
- Provider API tokens MUST NOT be stored in daemon secret paths.

## Functional Requirements

| ID | Requirement |
| --- | --- |
| FR-001 | Runtime Manager MUST treat `RuntimeSpec` as provider-neutral desired state. |
| FR-002 | Domain runtime management code MUST NOT import Railway SDKs, Railway CLI wrappers, Kubernetes clients, cloud SDKs, or provider DTOs. |
| FR-003 | `RailwayAdapter` MUST be the first `RuntimeProvider` implementation. |
| FR-004 | `KubernetesAdapter` SHOULD be the second `RuntimeProvider` implementation target. |
| FR-005 | Runtime Manager MUST provision one provider service per daemon instance. |
| FR-006 | Runtime Manager MUST NOT scale a daemon by increasing replicas of one service for Railway MVP. |
| FR-007 | Each runtime MUST have a unique `runtime_id` within a project and environment. |
| FR-008 | Each runtime MUST have a unique daemon identity value for `MULTICA_DAEMON_ID`. |
| FR-009 | Each runtime MUST have a unique secret path. |
| FR-010 | Each runtime MUST have isolated persistent storage mounted at `/data` or a provider-equivalent mount declared by the adapter mapping. |
| FR-011 | Runtime specs for daemon workloads MUST set `network.public` to `false`. |
| FR-012 | Runtime Manager MUST validate spec identity, image reference, storage mount, network mode, URL modes, and secret path before provider calls. |
| FR-013 | Runtime Manager API MUST persist desired state and enqueue reconciliation instead of invoking provider lifecycle methods directly. |
| FR-014 | Runtime Reconciler Worker MUST reconcile desired specs asynchronously. |
| FR-015 | Runtime Reconciler Worker MUST be idempotent for create, update, delete, restart, and status refresh flows. |
| FR-016 | RuntimeRegistry MUST persist desired specs, observed provider handles, observed state, reconciliation events, deletion policy, retention policy, and operator audit metadata. |
| FR-017 | Provider-specific identifiers MUST be stored in `RuntimeHandle` and observed state, not in core domain entities. |
| FR-018 | RuntimeProvider implementations MUST support `ensureRuntime`, `updateRuntime`, `deleteRuntime`, `getRuntimeStatus`, `listRuntimes`, and `restartRuntime`. |
| FR-019 | SecretStore implementations MUST support `ensureSecretPath`, `getSecretMetadata`, `deleteSecretPath`, and `rotateSecret`. |
| FR-020 | Runtime Manager MUST validate required daemon secrets before creating or updating a provider service. |
| FR-021 | `MULTICA_TOKEN` MUST be required for every daemon runtime. |
| FR-022 | `CODEX_AUTH_JSON_B64` MUST be required when `agent` is `codex`. |
| FR-023 | `GITHUB_TOKEN` MAY be present for private GitHub HTTPS clones and MUST be optional for public repository workloads. |
| FR-024 | OpenCode provider API keys SHOULD be configured through Multica agent `custom_env`; the daemon secret path MUST NOT become a generic LLM provider key store for Railway MVP. |
| FR-025 | Caddy MUST be the only public ingress service in Railway MVP. |
| FR-026 | Backend, frontend, database, and daemon services MUST be private in Railway MVP. |
| FR-027 | Caddy MUST route `/api/*`, `/auth/*`, `/uploads/*`, and `/ws` to the backend private service. |
| FR-028 | Caddy MUST route all remaining paths to the frontend private service. |
| FR-029 | Daemon services in Railway MVP SHOULD set `MULTICA_SERVER_URL` to `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080`. |
| FR-030 | Daemon services in Railway MVP SHOULD set `MULTICA_APP_URL` to `https://${{caddy.RAILWAY_PUBLIC_DOMAIN}}`. |
| FR-031 | Runtime deletion MUST support `retain_storage`, `delete_storage`, and `archive_storage` policies at the domain level. |
| FR-032 | `delete_storage` MUST require explicit operator confirmation before provider deletion is attempted. |
| FR-033 | `archive_storage` MAY be unsupported by a provider adapter, but unsupported archive requests MUST fail before deleting compute or storage. |
| FR-034 | Runtime Manager MUST record partial provisioning state and retry missing steps instead of creating duplicate services. |
| FR-035 | Runtime Manager MUST expose provider deployment status and daemon backend registration status as separate observed signals. |
| FR-036 | Runtime Manager MUST mark a runtime `degraded` when provider compute is running but daemon registration does not become healthy within the configured timeout. |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-001 | Runtime domain modules MUST remain provider-neutral and have zero direct dependency on external provider SDKs. |
| NFR-002 | Provider adapters MUST be replaceable behind the same `RuntimeProvider` contract without changing reconciler business rules. |
| NFR-003 | Secret values MUST NOT appear in logs, reconciliation events, audit events, provider error messages, or UI responses. |
| NFR-004 | Reconciliation MUST be eventually consistent and safe to retry after worker restart. |
| NFR-005 | Reconciliation MUST use bounded retry with persisted attempt metadata for provider and SecretStore failures. |
| NFR-006 | Runtime Manager MUST preserve enough observed state to resume partial provisioning without duplicate compute, volume, or secret path creation. |
| NFR-007 | Runtime Manager SHOULD complete a no-op reconciliation without provider mutation when desired and observed state already match. |
| NFR-008 | Runtime Manager API SHOULD return quickly after desired-state persistence and queueing; provider latency MUST NOT block normal UI requests. |
| NFR-009 | Contract tests MUST verify that any `RuntimeProvider` implementation satisfies the same lifecycle semantics. |
| NFR-010 | Contract tests MUST verify that any `SecretStore` implementation satisfies metadata, rotation, and deletion-policy semantics. |
| NFR-011 | Public network exposure MUST be minimized to the Caddy ingress in Railway MVP. |
| NFR-012 | Runtime Manager MUST provide operator-visible audit records for create, update, restart, delete, secret-rotation, and failure events. |

## Domain Model

### RuntimeSpec

`RuntimeSpec` is the desired daemon instance. It MUST be valid before any provider call.

```yaml
runtime_id: brave-vitality-opencode-1
project: brave-vitality
environment: production
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
  managed_by: multica-runtime-manager
```

Invariants:

- `runtime_id` MUST be globally unique within `project` and `environment`.
- `runtime_id` MUST map to exactly one daemon identity and one provider service.
- `agent` MUST be a supported daemon agent. Railway MVP MUST support `opencode` and `codex`.
- `image` MUST be a complete container image reference with an explicit tag.
- `desired_state` MUST be one of `running`, `stopped`, or `deleted`.
- `storage.mount_path` MUST be `/data` for Railway MVP.
- `network.public` MUST be `false` for daemon runtimes.
- `secrets.path` MUST be unique for the runtime.
- `labels.managed_by` MUST be `multica-runtime-manager`.

### RuntimeHandle

`RuntimeHandle` stores provider-specific identifiers for a runtime that has been created or discovered. It MUST be opaque to domain logic except for provider selection and runtime correlation.

Common fields:

| Field | Rule |
| --- | --- |
| `runtime_id` | MUST match the owning `RuntimeSpec.runtime_id`. |
| `provider` | MUST identify the adapter that owns the handle, such as `railway` or `kubernetes`. |
| `external_ids` | MUST contain adapter-owned identifiers and MUST NOT be interpreted by provider-neutral domain code. |
| `created_at` | MUST record when the handle was first persisted. |
| `updated_at` | MUST record the last observed handle update. |

Railway `external_ids` MUST be limited to Railway identifiers such as `service_id`, `volume_id`, `deployment_id`, `environment_id`, and `project_id`.

### RuntimeObservedState

`RuntimeObservedState` records what Runtime Manager last observed from the provider and the Multica backend.

Required fields:

| Field | Rule |
| --- | --- |
| `runtime_id` | MUST match the desired spec. |
| `status` | MUST be one of `pending`, `creating`, `running`, `degraded`, `deleting`, `deleted`, or `failed`. |
| `provider_phase` | MUST preserve the adapter-specific deployment phase as redacted text or enum data. |
| `daemon_registration` | MUST represent whether the Multica backend sees the daemon identity as registered and healthy. |
| `last_error` | MUST be redacted and MUST NOT contain secret values. |
| `last_reconciled_at` | MUST record the most recent reconciliation attempt timestamp. |

### RuntimeRegistry

RuntimeRegistry MUST persist:

- desired runtime specs;
- provider handles;
- observed provider state;
- daemon registration state;
- reconciliation events;
- deletion and retention policy;
- operator audit trail;
- retry attempt metadata.

RuntimeRegistry writes for desired state and enqueueing MUST be atomic from the API perspective. If the queue cannot be written, the desired-state mutation MUST fail or remain unapplied.

## Provider Adapter Contract

Every `RuntimeProvider` implementation MUST satisfy the same contract.

| Operation | Required behavior |
| --- | --- |
| `ensureRuntime(spec) -> RuntimeHandle` | Create or converge the runtime described by `spec`. MUST be idempotent. MUST return the persisted or newly created handle. |
| `updateRuntime(spec) -> RuntimeHandle` | Apply mutable changes to an existing runtime. MUST NOT create a second runtime for the same `runtime_id`. |
| `deleteRuntime(runtime_id, deletion_policy) -> void` | Delete or stop provider resources according to explicit deletion policy. MUST NOT delete storage for `retain_storage`. |
| `getRuntimeStatus(runtime_id) -> RuntimeObservedState` | Return current observed provider state for the runtime. MUST distinguish not found from provider API failure. |
| `listRuntimes(selector) -> RuntimeObservedState[]` | Return runtimes matching managed labels or provider-specific selection criteria. MUST NOT return unmanaged runtimes as managed. |
| `restartRuntime(runtime_id) -> void` | Restart existing compute for a runtime. MUST NOT mutate desired state. |

Provider adapter rules:

- Adapters MUST accept provider-neutral specs and adapter-owned configuration.
- Adapters MUST NOT require provider-specific fields inside `RuntimeSpec`.
- Adapters MUST use labels, names, persisted handles, or provider metadata to find existing managed resources.
- Adapters MUST record enough handle data to retry after partial success.
- Adapters MUST return retryable failure classification for transient provider errors.
- Adapters MUST return terminal failure classification for validation or unsupported capability errors.
- Adapters MUST redact provider tokens and daemon secret values from all returned errors.

## SecretStore Contract

Every `SecretStore` implementation MUST satisfy the same contract.

| Operation | Required behavior |
| --- | --- |
| `ensureSecretPath(path, values, policy) -> SecretHandle` | Create, update, or validate a secret path according to policy. MUST NOT expose stored secret values in the returned handle. |
| `getSecretMetadata(path) -> SecretMetadata` | Return key names, presence, version, and timestamps without returning secret values. |
| `deleteSecretPath(path, deletion_policy) -> void` | Apply explicit deletion policy. MUST preserve secrets for retain policy. |
| `rotateSecret(path, key, value) -> SecretHandle` | Replace one key value and return metadata-only handle data. |

SecretStore rules:

- `InfisicalSecretStore` MUST be the first implementation.
- Secret metadata reads MUST be sufficient to validate required key presence.
- Secret values MUST be write-only from the Runtime Manager domain perspective.
- `MULTICA_TOKEN` MUST be present for every daemon runtime before provider provisioning.
- `CODEX_AUTH_JSON_B64` MUST be present for `codex` runtimes before provider provisioning.
- `GITHUB_TOKEN` MAY be absent.
- Provider API tokens MUST be stored as Runtime Manager infrastructure credentials and MUST NOT be copied into daemon secret paths.

## Reconciliation Lifecycle

Runtime Manager MUST use this lifecycle for create, update, scale, delete, and restart flows:

1. API receives a desired-state request from an authorized operator.
2. API validates user input and computes one or more provider-neutral `RuntimeSpec` records.
3. API persists desired specs and reconciliation work atomically.
4. Runtime Reconciler Worker loads desired specs from RuntimeRegistry.
5. Reconciler validates domain invariants again before any external call.
6. Reconciler calls `SecretStore.getSecretMetadata` or `SecretStore.ensureSecretPath` to validate required secret paths.
7. Reconciler calls `RuntimeProvider.getRuntimeStatus` and reads persisted `RuntimeHandle`.
8. Reconciler computes a diff between desired state, observed provider state, and daemon registration state.
9. Reconciler applies provider mutations through `ensureRuntime`, `updateRuntime`, `restartRuntime`, or `deleteRuntime`.
10. Reconciler persists new handles, observed state, reconciliation events, and retry metadata.
11. Reconciler verifies daemon backend registration when provider compute reports running.
12. Reconciler marks the runtime `running`, `degraded`, `deleted`, or `failed` based on provider state, registration state, and failure classification.

Status rules:

- `pending` means desired state exists but no provider mutation has started.
- `creating` means provider resources are being created or updated.
- `running` means provider compute is running and daemon registration is healthy.
- `degraded` means provider compute exists but a required health signal, registration signal, restart, or secret rotation did not complete.
- `deleting` means deletion has started and final provider state has not been confirmed.
- `deleted` means compute is removed and storage policy has been applied.
- `failed` means reconciliation reached a terminal error that requires operator action.

Retry rules:

- Transient provider and SecretStore failures MUST be retried with bounded backoff.
- Partial provisioning MUST persist the successful step before retrying the failed step.
- A retry MUST NOT create duplicate compute, volume, or secret path resources.
- Terminal validation errors MUST stop provider mutation and surface actionable status.

## Railway MVP Mapping

Railway MVP MUST use this topology:

```text
Public clients
  |
  v
Caddy public ingress
  |
  +-- /api, /auth, /uploads, /ws -> backend private
  +-- all other paths            -> frontend private

Railway private network
  |
  +-- daemon-opencode-1 -> backend private
  +-- daemon-opencode-2 -> backend private
  +-- daemon-codex-1    -> backend private
  +-- backend           -> pgvector private
```

Railway service rules:

- Caddy MUST be the only public Railway service for browser and local CLI traffic.
- Backend public networking MUST be disabled in the accepted Railway MVP.
- Frontend public networking MUST be disabled in the accepted Railway MVP.
- Daemon public networking MUST be disabled.
- Database public networking MUST be disabled.
- Daemons MUST connect to backend over Railway private networking.
- Staging validation SHOULD prove Caddy HTTP and WebSocket routing before direct backend and frontend public networking are disabled in production.

RailwayAdapter MUST map each `RuntimeSpec` to:

- one Railway image service;
- one Railway volume mounted at `/data`;
- service variables for daemon runtime configuration;
- private networking only for daemon service traffic;
- restart policy appropriate for long-running daemon compute;
- deployment status and health status in observed state.

Railway handle fields MUST remain provider-specific:

```yaml
provider: railway
external_ids:
  service_id: railway-service-identifier
  volume_id: railway-volume-identifier
  deployment_id: railway-deployment-identifier
  environment_id: railway-environment-identifier
  project_id: railway-project-identifier
```

Railway runtime variable mapping SHOULD include:

```dotenv
MULTICA_SERVER_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080
MULTICA_APP_URL=https://${{caddy.RAILWAY_PUBLIC_DOMAIN}}
MULTICA_WORKSPACES_ROOT=/data/workspaces
```

The variable values above are Railway MVP conventions. Runtime Manager MUST keep the URL mode fields provider-neutral and let `RailwayAdapter` render provider-specific variable values.

## Future Provider Mapping

### KubernetesAdapter

`KubernetesAdapter` SHOULD be the second adapter target. It MUST prove that Runtime Manager does not depend on Railway semantics.

`KubernetesAdapter` SHOULD map one `RuntimeSpec` to:

- a Deployment or StatefulSet for daemon compute;
- one PersistentVolumeClaim for `/data`;
- a Kubernetes Secret or ExternalSecret for secret material;
- a ConfigMap for non-secret runtime configuration;
- a NetworkPolicy that blocks public ingress to daemon pods;
- labels for selection, ownership, and garbage collection;
- pod conditions and rollout state in observed provider status.

Kubernetes mapping MUST NOT require Railway-style service, volume, or deployment identifiers inside `RuntimeSpec`.

### AWS, Yandex Cloud, and Cloud.ru

Future provider adapters MAY target AWS ECS/Fargate, AWS EFS, AWS Secrets Manager, private subnets, and CloudWatch logs when the provider can satisfy long-running compute, persistent storage, private networking, and managed secret requirements.

Yandex Cloud and Cloud.ru SHOULD first be evaluated through managed Kubernetes offerings when available. Direct container platform adapters MAY be added only when they support long-running containers, persistent storage, private networking, managed secrets, and provider APIs suitable for reconciliation.

### Vercel

Vercel MUST NOT be a daemon runtime provider. Vercel MAY host frontend surfaces outside Railway MVP, but daemon fleets MUST run on Railway, Kubernetes, ECS/Fargate, or comparable VM/container infrastructure.

## Security Model

- Railway MVP MUST expose only Caddy publicly.
- Caddy MUST terminate public browser and local CLI ingress and proxy only approved paths to private services.
- Backend, frontend, database, and daemons MUST remain private after Caddy routing is validated.
- Daemon services MUST NOT accept public inbound control traffic.
- Provider API tokens MUST be infrastructure credentials scoped to Runtime Manager and MUST NOT be injected into daemon containers.
- Daemon runtime credentials MUST be stored in SecretStore paths scoped per runtime.
- Runtime Manager MUST use metadata-only secret reads for validation.
- Secret values MUST be redacted from logs, events, UI responses, provider errors, and audit records.
- Deleting storage MUST require explicit operator confirmation and audit metadata.
- Runtime Manager API mutation endpoints MUST require admin authorization.
- Runtime Manager MUST reject duplicate daemon identities before provider calls.
- Runtime Manager SHOULD show the number of services to be created or deleted before applying a fleet-size change.
- Caddy WebSocket routing MUST be tested because daemon and browser workflows rely on backend WebSocket support.

## Failure Modes

| Failure mode | Detection | Required behavior |
| --- | --- | --- |
| Duplicate `runtime_id` or daemon identity | Domain validation | MUST reject request and MUST NOT call provider or SecretStore mutation methods. |
| Missing `MULTICA_TOKEN` | Secret metadata validation | MUST block provisioning and mark runtime `failed` with actionable redacted error. |
| Missing `CODEX_AUTH_JSON_B64` for `codex` | Secret metadata validation | MUST block provisioning and mark runtime `failed` with actionable redacted error. |
| Provider API unavailable | Provider adapter error classification | MUST record retryable event and retry with bounded backoff. |
| Service created but volume creation failed | Persisted partial handle | MUST retry volume creation against the existing service and MUST NOT create another service. |
| Volume created but variables failed | Persisted partial handle | MUST retry variable application and MUST preserve the existing volume. |
| Variables applied but deployment failed | Provider deployment status | MUST mark runtime `degraded` or retry according to provider error classification. |
| Daemon compute running but backend registration missing | Registration check timeout | MUST mark runtime `degraded` and expose both provider-running and registration-missing signals. |
| Caddy route misconfiguration | Route tests or staging verification | MUST fail validation before Caddy becomes the only public ingress. |
| WebSocket upgrade not proxied | WebSocket validation scenario | MUST fail validation and keep previous verified ingress configuration. |
| Secret rotation succeeds but restart fails | Restart operation result | MUST keep previous observed provider state and mark runtime `degraded`. |
| `delete_storage` requested without confirmation | API validation | MUST reject request and MUST NOT delete compute or storage. |
| Provider lacks `archive_storage` support | Adapter capability check | MUST fail before deleting compute or storage. |

## Validation Scenarios

| ID | Scenario | Expected result |
| --- | --- | --- |
| VS-001 | Submit two specs with the same `runtime_id` in one project and environment. | Validation fails; provider and SecretStore mutation calls are not made. |
| VS-002 | Submit two specs with different `runtime_id` values but the same `MULTICA_DAEMON_ID`. | Validation fails before provider calls. |
| VS-003 | Submit a daemon spec with `network.public: true`. | Validation fails before provider calls. |
| VS-004 | Submit an image reference without an explicit tag. | Validation fails before provider calls. |
| VS-005 | Apply the same valid Railway spec twice. | Exactly one Railway service and one Railway volume exist for the runtime. |
| VS-006 | Increase `opencode` count from one to two. | Exactly one additional runtime spec, service, volume, and secret path are created. |
| VS-007 | Decrease `opencode` count from two to one with `retain_storage`. | One runtime enters deletion; compute is removed or stopped; storage is retained. |
| VS-008 | Request `delete_storage` without explicit confirmation. | API rejects the request and records no provider deletion event. |
| VS-009 | Create a `codex` runtime without `CODEX_AUTH_JSON_B64` in secret metadata. | Runtime provisioning is blocked and status becomes `failed`. |
| VS-010 | Simulate Railway service creation success followed by volume failure. | Retry resumes from the persisted service handle and does not create a duplicate service. |
| VS-011 | Route `GET /api/health` through Caddy. | Request reaches the private backend service. |
| VS-012 | Open a WebSocket connection to `/ws` through Caddy. | Upgrade reaches the private backend service. |
| VS-013 | Request a frontend route through Caddy. | Request reaches the private frontend service. |
| VS-014 | Start a daemon with backend private URL and Caddy app URL. | Daemon connects to backend privately and task links use the public Caddy origin. |
| VS-015 | Rotate `MULTICA_TOKEN` and force restart failure. | Secret metadata updates, runtime restart failure is recorded, and status becomes `degraded`. |
| VS-016 | Run provider contract tests against fake Railway and fake Kubernetes providers. | The reconciler behavior is identical for provider-neutral lifecycle scenarios. |
| VS-017 | Inspect reconciliation logs and events after failures. | No secret values, provider tokens, token prefixes, or decoded auth material are present. |

## Acceptance Criteria

Runtime Manager implementation conforms to this specification when all criteria below are true:

- Provider-neutral domain code contains no Railway, Kubernetes, AWS, Yandex Cloud, Cloud.ru, or Vercel SDK dependency.
- `RuntimeSpec`, `RuntimeHandle`, `RuntimeObservedState`, `RuntimeProvider`, `SecretStore`, and RuntimeRegistry responsibilities are implemented according to this document.
- `RailwayAdapter` provisions one private Railway daemon service and one `/data` volume per runtime instance.
- `RailwayAdapter` is idempotent for repeated create, update, status, restart, and delete operations.
- Railway MVP deploys Caddy as the only public ingress.
- Railway MVP routes `/api/*`, `/auth/*`, `/uploads/*`, and `/ws` to the private backend.
- Railway MVP routes all remaining paths to the private frontend.
- Railway MVP daemon services use private backend connectivity and Caddy public app URL conventions.
- Runtime Manager API persists desired state and enqueues reconciliation without provider mutation in the request path.
- Reconciler handles create, update, scale-up, scale-down, retry, restart, secret rotation, and deletion flows.
- SecretStore integration validates required secret metadata before provider provisioning.
- Secret values and provider tokens are absent from logs, events, audit records, and UI responses.
- Deletion policies `retain_storage`, `delete_storage`, and `archive_storage` are represented in the domain model, and unsupported provider capability is reported before destructive action.
- Contract tests pass for `RuntimeProvider` and `SecretStore` implementations.
- Validation scenarios in this document pass or are explicitly mapped to automated tests plus one documented manual staging check for Railway networking and WebSocket behavior.
- A Kubernetes mapping spike demonstrates that no Railway-specific assumption is required by the core reconciler.

## Open Questions

These questions are non-blocking for Railway MVP. Each item includes the rule that applies until a later ADR or implementation spec changes it.

| ID | Question | Current rule |
| --- | --- | --- |
| OQ-001 | Which storage engine should back RuntimeRegistry first? | RuntimeRegistry MUST be exposed behind a repository abstraction with transactional desired-state persistence and queueing semantics. |
| OQ-002 | Should Kubernetes use Deployment or StatefulSet for daemon compute? | `KubernetesAdapter` design spike MUST compare both, but `RuntimeSpec` MUST remain independent of the workload kind. |
| OQ-003 | What is the first archive target for `archive_storage`? | Providers MAY report `archive_storage` unsupported; unsupported archive requests MUST fail before compute or storage deletion. |
| OQ-004 | What are production maximum daemon counts per project and agent? | Runtime Manager SHOULD support project-level limits, and Admin UI SHOULD show the number of services to create before applying changes. |
| OQ-005 | Which backend signal is authoritative for daemon registration health? | Runtime Manager MUST keep provider running state separate from daemon registration state and MUST mark mismatches as `degraded`. |

## Self-Review

- Проверка запрещенных маркеров: документ не содержит незавершенных маркеров разработки или многоточий из трех точек.
- Проверка противоречий: RailwayAdapter закреплен как первый provider adapter, KubernetesAdapter закреплен как второй target, Caddy закреплен как единственный public ingress для Railway MVP, daemons закреплены как private one-service-per-instance workloads.
- Проверка незакрытых решений: для Railway MVP блокирующих незакрытых решений нет; Open Questions ограничены будущими adapter и operational choices, для каждого указан действующий rule.
- Проверка write scope: документ является новым файлом спецификации и не требует изменения design doc или кода.
