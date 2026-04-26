# Deploy and Host Multica on Railway

Multica is an open-source platform for building, managing, and orchestrating AI agents that execute directly on your infrastructure. It provides a full-stack environment for agent communication, task management, and tool integration, allowing you to build persistent AI teammates that live where your code does.

## About Hosting Multica

Hosting Multica on Railway provides a robust, production-ready environment for your agent operations. This template automates the deployment of a three-tier architecture: a Go backend for high-performance API and WebSocket handling, a Next.js frontend for a seamless management interface, and a pgvector-enabled PostgreSQL database for long-term memory and semantic search. By hosting on Railway, you benefit from automatic SSL, private networking between services, and persistent volumes for agent logs and uploads, all without the overhead of manual server configuration or container orchestration.

## Common Use Cases

- **Private AI Teammates:** Host persistent agents that interact with your private GitHub repositories and internal tools.
- **Self-Hosted Managed Agents:** Maintain full control over your agent data and execution environment for security-sensitive workflows.
- **Custom Agent Workflows:** Use Multica as a foundation to build specialized agents for code review, automated testing, or data processing.

## Dependencies for Multica Hosting

- **Railway Account:** To provision the database, backend, and frontend services.
- **GitHub Repository:** To source the code and trigger automatic redeployments on push.

### Deployment Dependencies

- [Upstream Repository](https://github.com/multica-ai/multica)
- [Railway Documentation](https://docs.railway.app)
- [pgvector Docker Image](https://hub.docker.com/r/pgvector/pgvector)

## Why Deploy Multica on Railway?

Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

By deploying Multica on Railway, you are one step closer to supporting a complete full-stack application with minimal burden. Host your servers, databases, AI agents, and more on Railway.

## Quick Start & Login

Once your services are deployed:

1. **Access the App**: Open the public domain generated for your `frontend` service.
2. **First Login**: Enter your email address to receive a verification code.
3. **Missing API Keys?**:
   - **No Resend API Key**: If `RESEND_API_KEY` is not provided, you will not receive an email. Instead, open your Railway Dashboard, go to the `backend` service logs, and look for a line containing `"Verification code"`. Copy that code to log in.
   - **No Google API Keys**: Social login will be unavailable. You must use the email code method described above.
4. **Consequences**: Without these keys, your deployment is still fully functional, but "self-serve" signup is limited. Users will need you to provide their login codes from the logs until you configure a verified email sender.

---

# Railway Deployment Guide

This directory contains service config files for deploying Multica on Railway as three services: `frontend`, `backend`, and `pgvector`.

## Services

| Service | Source | Config |
|---------|--------|--------|
| `frontend` | GitHub repo | `/railway/frontend.railway.json` |
| `backend` | GitHub repo | `/railway/backend.railway.json` |
| `pgvector` | Docker image `pgvector/pgvector:pg17` | Railway service settings |

In Railway service settings or Template Composer, set the config file path for each GitHub-backed service:

```text
backend config file path = /railway/backend.railway.json
frontend config file path = /railway/frontend.railway.json
```

## pgvector

- Disable public HTTP networking.
- Keep private networking enabled.
- Use the Docker image `pgvector/pgvector:pg17`.
- Mount `pgvector-volume` at `/var/lib/postgresql/data`.

| Variable | Description |
| :--- | :--- |
| **POSTGRES_DB** | The name of the default database to create (e.g., `multica`). |
| **POSTGRES_USER** | The username for the primary database administrator. |
| **POSTGRES_PASSWORD** | The password for the primary database administrator (generate a secret). |
| **PGDATA** | The internal path within the volume where PostgreSQL data is stored. |

## Template Composer Bulk Edit Reference

Copy and paste these blocks directly into the **Bulk Edit** mode of the Variables section in the Railway Template Composer.

### Backend Service Variables
```bash
DATABASE_URL="postgres://${{pgvector.POSTGRES_USER}}:${{pgvector.POSTGRES_PASSWORD}}@${{pgvector.RAILWAY_PRIVATE_DOMAIN}}:5432/${{pgvector.POSTGRES_DB}}?sslmode=disable" # The connection string for the PostgreSQL database (including credentials and domain).
DATABASE_MAX_CONNS="10" # The maximum number of simultaneous connections to the database.
DATABASE_MIN_CONNS="2" # The minimum number of idle connections to keep open in the database pool.
PORT="8080" # The port on which the Go backend API will listen (usually 8080).
APP_ENV="production" # The execution environment (set to production for Railway).
JWT_SECRET="${{secret(64, "abcdef0123456789")}}" # Secret key used to sign and verify authentication tokens (generate a secret).
FRONTEND_ORIGIN="https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}" # The public URL of your frontend service (used for CORS and auth redirects).
CORS_ALLOWED_ORIGINS="https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}" # Comma-separated list of origins allowed to make cross-site requests to the API.
MULTICA_APP_URL="https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}" # The primary public URL used to access the Multica application.
LOCAL_UPLOAD_DIR="/app/data/uploads" # Path to the directory where uploaded assets and logs are stored.
LOCAL_UPLOAD_BASE_URL="https://${{backend.RAILWAY_PUBLIC_DOMAIN}}" # The base public URL used to serve locally uploaded files (usually the backend domain).
REALTIME_METRICS_TOKEN="${{secret(64, "abcdef0123456789")}}" # Secret token required to access the internal real-time performance metrics endpoint (generate a secret).
ANALYTICS_DISABLED="true" # Set to true to opt-out of telemetry and usage tracking.
ALLOW_SIGNUP="true" # Set to true to allow new users to register on this instance.
ALLOWED_EMAIL_DOMAINS=" " # Comma-separated list of email domains (e.g., company.com) allowed to sign up.
ALLOWED_EMAILS=" " # Comma-separated list of specific email addresses allowed to sign up.
RESEND_API_KEY=" " # API key for the Resend email delivery service (optional for local logs).
RESEND_FROM_EMAIL=" " # The verified sender email address for Resend notifications.
GOOGLE_CLIENT_ID=" " # The Google OAuth2 Client ID for social authentication.
GOOGLE_CLIENT_SECRET=" " # The Google OAuth2 Client Secret for social authentication.
GOOGLE_REDIRECT_URI="https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}/auth/callback" # The OAuth2 callback URL for Google login (must match your Google Cloud Console).
RAILWAY_DOCKERFILE_PATH="Dockerfile" # Path to the Dockerfile used to build the backend service (usually Dockerfile).
```

### Frontend Service Variables
```bash
PORT="3000" # The port on which the Next.js server will listen (usually 3000).
HOSTNAME="0.0.0.0" # The network interface the server binds to (set to 0.0.0.0 for Railway).
REMOTE_API_URL="http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080" # The internal Railway URL used by the frontend to proxy requests to the backend.
NEXT_PUBLIC_APP_VERSION="railway-template" # A version identifier for the frontend build (e.g., railway-template).
DOCS_URL="https://multica.ai" # The URL where the application documentation is hosted (defaults to https://multica.ai).
RAILWAY_DOCKERFILE_PATH="Dockerfile.web" # Path to the Dockerfile used to build the web service (usually Dockerfile.web).
```

### pgvector Service Variables
```bash
POSTGRES_DB="multica" # The name of the default database to create.
POSTGRES_USER="multica" # The username for the primary database administrator.
POSTGRES_PASSWORD="${{secret(64, "abcdef0123456789")}}" # The password for the primary database administrator (generate a secret).
PGDATA="/var/lib/postgresql/data/pgdata" # The internal path within the volume where PostgreSQL data is stored.
```

Leave `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` unset for the web service. The browser uses same-origin `/api`, `/auth`, and `/ws` routes, and Next.js rewrites proxy those requests to `REMOTE_API_URL`. This keeps cookie auth on the frontend origin for Railway public domains.

`DOCS_URL` is a build-time value for the Next.js `/docs` rewrite, so redeploy the frontend after changing it.

## Required After Deploy

- Open the frontend domain and log in with an email code. If `RESEND_API_KEY` is unset, read the generated code from backend logs with `railway logs --service backend --latest --lines 200 --filter "Verification code"`.
- Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on `backend` only when users need self-serve email delivery instead of operator log-code login.
- Install the CLI locally with `brew install multica-ai/tap/multica`.
- Run `multica setup self-host --server-url https://<backend-domain> --app-url https://<frontend-domain>`.
- Create an agent and assign an issue.
- Set `ALLOW_SIGNUP=false` after first admin bootstrap if the deployment is private.
- Use custom frontend/backend domains before configuring long-lived Google OAuth redirect URIs.

## Verification

```bash
curl -sf https://<backend-domain>/health
curl -sf https://<backend-domain>/readyz
curl -I https://<frontend-domain>
curl -I https://<frontend-domain>/docs
multica daemon status
```

Expected results: backend health and readiness return `ok`, the frontend homepage responds, `/docs` does not return `500`, and the local daemon is connected to the Railway backend.
