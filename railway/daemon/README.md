# Railway Daemon Runtime

This directory contains the Railway worker runtime for managed Multica daemon services.

Use one Railway service, one Railway volume, one daemon id, and one Infisical secret path per runtime.

## Services

Supported MVP runtimes:

| Service | `AGENT` | Purpose |
| --- | --- | --- |
| `daemon-opencode` | `opencode` | OpenCode-backed Multica runtime |
| `daemon-codex` | `codex` | Codex-backed Multica runtime using ChatGPT subscription credentials |

Public networking should stay disabled for daemon services. Railway can run the `/health` healthcheck without assigning a public domain, and the daemon does not expose user-facing routes.

Daemon services use `restartPolicyType=ON_FAILURE` with `restartPolicyMaxRetries=10`.

The image runs as the non-root `multica` user with UID/GID `10001`. The `/data` volume must be writable by this user; startup checks this before launching the daemon.

## Build Variables

Build variables are evaluated while Railway builds the image. Do not put tokens or credentials in build variables.

`daemon-opencode`:

```dotenv
AGENT=opencode
MULTICA_VERSION=v0.2.28
NODE_VERSION=22.15.0
PNPM_VERSION=10.10.0
INFISICAL_CLI_VERSION=0.43.82
OPENCODE_VERSION=1.14.41
OPENCODE_SHA256_X64=d27d3c85183a7bd2df4506484a2f508d1897962063b7ccc8466705b493963dc5
```

`daemon-codex`:

```dotenv
AGENT=codex
MULTICA_VERSION=v0.2.28
NODE_VERSION=22.15.0
PNPM_VERSION=10.10.0
INFISICAL_CLI_VERSION=0.43.82
CODEX_VERSION=0.128.0
```

The MVP build target is `linux/amd64`. The Dockerfile downloads Linux x64 Node.js and amd64 Multica release assets, so build and run daemon services on `linux/amd64` until architecture mapping is added for all downloaded binaries.

The Dockerfile fail-fast rejects non-`amd64` build targets.

## Runtime Variables

Runtime `AGENT` must match the build `AGENT`.

Default Infisical SaaS API URL:

```dotenv
INFISICAL_API_URL=https://app.infisical.com/api
```

For the EU Infisical region, set:

```dotenv
INFISICAL_API_URL=https://eu.infisical.com/api
```

`daemon-opencode`:

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

`daemon-codex`:

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

## Infisical Secrets

Create one Infisical path per daemon runtime.

OpenCode path example:

```dotenv
MULTICA_TOKEN=mul_runtime_token
GITHUB_TOKEN=github_token_with_repo_read_access
```

Codex path example:

```dotenv
MULTICA_TOKEN=mul_runtime_token
GITHUB_TOKEN=github_token_with_repo_read_access
CODEX_AUTH_JSON_B64=base64_encoded_codex_auth_json
```

`GITHUB_TOKEN` is optional and is used only for private GitHub HTTPS clones.

`CODEX_AUTH_JSON_B64` is required only for `AGENT=codex`. Create it from a local Codex login:

```bash
export CODEX_HOME=/tmp/codex-bootstrap
codex login --device-auth
base64 -w 0 /tmp/codex-bootstrap/auth.json
```

OpenCode provider credentials are configured per agent in Multica `custom_env`, not in the daemon Infisical path. For example, set one or more of:

```dotenv
ANTHROPIC_API_KEY=sk-ant-provider-key
OPENAI_API_KEY=sk-provider-key
GOOGLE_API_KEY=provider-key
```

Multica injects agent `custom_env` into the spawned OpenCode process. Do not put provider keys in Docker build variables.

## Volumes

Each daemon service must mount one Railway volume at `/data`.

The runtime uses:

| Path | Purpose |
| --- | --- |
| `/data/workspaces` | cloned task repositories and worktrees |
| `/data/home` | managed home directory, `.netrc`, and `.git-credentials` |
| `/data/codex` | Codex subscription auth state |
| `/data/opencode/config` | OpenCode config directory via `OPENCODE_CONFIG_DIR` |
| `/data/opencode/data` | OpenCode data/auth directory via `XDG_DATA_HOME` |
| `/data/opencode/xdg-config` | XDG config root via `XDG_CONFIG_HOME` |

`railway/daemon/railway.json` declares `requiredMountPath: "/data"` so Railway refuses deploys without the mounted volume. The config does not create the volume; attach it in Railway service settings.

The container does not run as `root`. If a volume is recreated outside Railway, keep `/data` writable by UID/GID `10001`.

## Local Docker Build Validation

Run from the repository root.

OpenCode:

```bash
docker build --platform linux/amd64 -f railway/daemon/Dockerfile \
  --build-arg AGENT=opencode \
  --build-arg MULTICA_VERSION=v0.2.28 \
  --build-arg NODE_VERSION=22.15.0 \
  --build-arg PNPM_VERSION=10.10.0 \
  --build-arg INFISICAL_CLI_VERSION=0.43.82 \
  --build-arg OPENCODE_VERSION=1.14.41 \
  --build-arg OPENCODE_SHA256_X64=d27d3c85183a7bd2df4506484a2f508d1897962063b7ccc8466705b493963dc5 \
  -t multica-daemon:opencode .
```

Codex:

```bash
docker build --platform linux/amd64 -f railway/daemon/Dockerfile \
  --build-arg AGENT=codex \
  --build-arg MULTICA_VERSION=v0.2.28 \
  --build-arg NODE_VERSION=22.15.0 \
  --build-arg PNPM_VERSION=10.10.0 \
  --build-arg INFISICAL_CLI_VERSION=0.43.82 \
  --build-arg CODEX_VERSION=0.128.0 \
  -t multica-daemon:codex .
```

## Troubleshooting

**Infisical fetch fails**

Check `INFISICAL_TOKEN`, `INFISICAL_PROJECT_ID`, `INFISICAL_ENV`, `INFISICAL_SECRET_PATH`, and `INFISICAL_API_URL`. The token must have read access to the configured path.

**Private GitHub repo clone fails**

Add `GITHUB_TOKEN` to the runtime Infisical path. Startup writes managed `/data/home/.netrc` and `/data/home/.git-credentials`, configures Git's credential helper, and removes the token from the process environment before launching the daemon.

**Codex tasks fail after startup**

Check that `/data/codex/auth.json` exists and was created from the intended ChatGPT account. The container preserves an existing volume copy and only decodes `CODEX_AUTH_JSON_B64` when the file is missing.

**OpenCode is not detected**

Check Railway build logs for the pinned OpenCode release download and startup logs for `opencode --version`.

**Task wakeup WebSocket shows `bad handshake`**

The daemon continues polling for tasks when WebSocket wakeup is unavailable. Keep `LOG_LEVEL=info` to suppress repeated debug messages while preserving normal task execution logs.
