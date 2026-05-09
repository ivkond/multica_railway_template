# Merge Daemon Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Railway daemon runtime from `ivkond/multica-daemon` into `ivkond/multica_railway_template` under `railway/daemon/`.

**Architecture:** Keep backend, frontend, and pgvector deployment files unchanged. Add daemon-specific Railway config, Dockerfile, scripts, and docs under `railway/daemon/`, then update root and Railway docs so one repository owns the full Railway stack.

**Tech Stack:** Railway Config as Code, Docker, Bash, Python stdlib health proxy, Infisical CLI, Multica CLI, Codex CLI, OpenCode CLI.

---

## File Structure

- Create `railway/daemon/Dockerfile`: daemon image build for `AGENT=codex` or `AGENT=opencode`.
- Create `railway/daemon/railway.json`: Railway config path for daemon services with `/health` and `requiredMountPath: "/data"`.
- Create `railway/daemon/scripts/entrypoint.sh`: runtime validation, Infisical export, credential setup, health proxy launch, daemon exec.
- Create `railway/daemon/scripts/setup_multica.sh`: Multica CLI config and token login.
- Create `railway/daemon/scripts/setup_agent.sh`: Codex/OpenCode runtime state setup.
- Create `railway/daemon/scripts/health_proxy.py`: Railway health endpoint bridge.
- Create `railway/daemon/README.md`: daemon-specific build variables, runtime variables, secrets, volumes, validation, troubleshooting.
- Modify `README.md`: describe the repo as full Railway stack including managed daemon runtimes.
- Modify `railway/README.md`: document daemon services, build/runtime variable blocks, volumes, networking, and verification.
- Keep unchanged: `railway/backend.railway.json`, `railway/frontend.railway.json`, root `Dockerfile`, `Dockerfile.web`, app/server source.

## Task 1: Copy Daemon Runtime Files

**Files:**
- Create: `railway/daemon/Dockerfile`
- Create: `railway/daemon/railway.json`
- Create: `railway/daemon/scripts/entrypoint.sh`
- Create: `railway/daemon/scripts/setup_multica.sh`
- Create: `railway/daemon/scripts/setup_agent.sh`
- Create: `railway/daemon/scripts/health_proxy.py`

- [ ] **Step 1: Create daemon directories**

Run:

```powershell
New-Item -ItemType Directory -Force railway\daemon\scripts
```

Expected: directories exist.

- [ ] **Step 2: Copy source files from daemon worktree**

Run:

```powershell
Copy-Item C:\tmp\multica-daemon-task1-health-proxy\Dockerfile railway\daemon\Dockerfile
Copy-Item C:\tmp\multica-daemon-task1-health-proxy\railway.json railway\daemon\railway.json
Copy-Item C:\tmp\multica-daemon-task1-health-proxy\scripts\entrypoint.sh railway\daemon\scripts\entrypoint.sh
Copy-Item C:\tmp\multica-daemon-task1-health-proxy\scripts\setup_multica.sh railway\daemon\scripts\setup_multica.sh
Copy-Item C:\tmp\multica-daemon-task1-health-proxy\scripts\setup_agent.sh railway\daemon\scripts\setup_agent.sh
Copy-Item C:\tmp\multica-daemon-task1-health-proxy\scripts\health_proxy.py railway\daemon\scripts\health_proxy.py
```

Expected: copied files match source before path edits.

- [ ] **Step 3: Verify copied file content before path edits**

Run:

```powershell
git diff --no-index C:\tmp\multica-daemon-task1-health-proxy\Dockerfile railway\daemon\Dockerfile
git diff --no-index C:\tmp\multica-daemon-task1-health-proxy\railway.json railway\daemon\railway.json
git diff --no-index C:\tmp\multica-daemon-task1-health-proxy\scripts\entrypoint.sh railway\daemon\scripts\entrypoint.sh
git diff --no-index C:\tmp\multica-daemon-task1-health-proxy\scripts\setup_multica.sh railway\daemon\scripts\setup_multica.sh
git diff --no-index C:\tmp\multica-daemon-task1-health-proxy\scripts\setup_agent.sh railway\daemon\scripts\setup_agent.sh
git diff --no-index C:\tmp\multica-daemon-task1-health-proxy\scripts\health_proxy.py railway\daemon\scripts\health_proxy.py
```

Expected: each command exits `0`.

## Task 2: Patch Daemon Railway And Docker Paths

**Files:**
- Modify: `railway/daemon/Dockerfile`
- Modify: `railway/daemon/railway.json`

- [ ] **Step 1: Update Dockerfile script copy paths**

Use explicit paths from the repository root:

```dockerfile
COPY railway/daemon/scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY railway/daemon/scripts/setup_multica.sh /usr/local/bin/setup_multica.sh
COPY railway/daemon/scripts/setup_agent.sh /usr/local/bin/setup_agent.sh
COPY railway/daemon/scripts/health_proxy.py /usr/local/bin/health_proxy.py
```

- [ ] **Step 2: Update daemon Railway config**

Set `railway/daemon/railway.json` to:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "railway/daemon/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "requiredMountPath": "/data",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Step 3: Verify path contract**

Run:

```powershell
rg ('COPY ' + 'scripts/') railway\daemon\Dockerfile
rg "COPY railway/daemon/scripts/(entrypoint.sh|setup_multica.sh|setup_agent.sh|health_proxy.py)" railway\daemon\Dockerfile
```

Expected: first command finds no matches; second command finds four matches.

## Task 3: Add Daemon Documentation

**Files:**
- Create: `railway/daemon/README.md`
- Modify: `README.md`
- Modify: `railway/README.md`

- [ ] **Step 1: Write `railway/daemon/README.md`**

Include these sections:

```markdown
# Railway Daemon Runtime

## Services
## Build Variables
## Runtime Variables
## Infisical Secrets
## Volumes
## Networking
## Local Docker Build Validation
## Troubleshooting
```

Expected: docs include complete `daemon-opencode` and `daemon-codex` build/runtime blocks from the approved design spec.

- [ ] **Step 2: Update root README**

Update repository purpose and service table so it includes:

```markdown
| `railway/daemon/railway.json` | Railway build/start config for Codex/OpenCode daemon runtime services |
```

Expected: root README presents the repo as backend, frontend, pgvector, and daemon runtime deployment source.

- [ ] **Step 3: Update `railway/README.md`**

Add daemon sections for:

```markdown
### Daemon OpenCode Build Variables
### Daemon OpenCode Runtime Variables
### Daemon Codex Build Variables
### Daemon Codex Runtime Variables
### Daemon Volumes And Networking
```

Expected: docs state daemon public networking is disabled by default, each daemon service needs `/data`, backend production uploads need `/app/data/uploads`, OpenCode provider keys are configured through per-agent `custom_env`, and post-deploy verification includes both Railway daemon services.

## Task 4: Validate

**Files:**
- Validate all created and modified files.

- [ ] **Step 1: Static validation**

Run:

```powershell
git diff --check
& 'C:\Program Files\Git\bin\bash.exe' -n railway/daemon/scripts/entrypoint.sh
& 'C:\Program Files\Git\bin\bash.exe' -n railway/daemon/scripts/setup_agent.sh
& 'C:\Program Files\Git\bin\bash.exe' -n railway/daemon/scripts/setup_multica.sh
```

Expected: all commands exit `0`.

- [ ] **Step 2: Python validation when available**

Run:

```powershell
python -m py_compile railway\daemon\scripts\health_proxy.py
```

Expected: exits `0`; if local Python is unavailable, record that explicitly.

- [ ] **Step 3: Docker build validation**

Run `daemon-opencode`:

```powershell
docker build --platform linux/amd64 -f railway/daemon/Dockerfile --build-arg AGENT=opencode --build-arg MULTICA_VERSION=v0.2.28 --build-arg NODE_VERSION=22.15.0 --build-arg PNPM_VERSION=10.10.0 --build-arg INFISICAL_CLI_VERSION=0.43.82 --build-arg OPENCODE_VERSION=1.14.41 --build-arg OPENCODE_SHA256_X64=d27d3c85183a7bd2df4506484a2f508d1897962063b7ccc8466705b493963dc5 -t multica-daemon:opencode .
```

Run `daemon-codex`:

```powershell
docker build --platform linux/amd64 -f railway/daemon/Dockerfile --build-arg AGENT=codex --build-arg MULTICA_VERSION=v0.2.28 --build-arg NODE_VERSION=22.15.0 --build-arg PNPM_VERSION=10.10.0 --build-arg INFISICAL_CLI_VERSION=0.43.82 --build-arg CODEX_VERSION=0.128.0 -t multica-daemon:codex .
```

Expected: both builds complete. If Docker is unavailable or too slow locally, run equivalent Railway builds before switching production source settings.

## Commit Plan

Commit after successful static validation:

```bash
git add README.md railway/README.md railway/daemon docs/superpowers/plans/2026-05-09-merge-daemon-runtime.md
git commit -m "add railway daemon runtime"
```
