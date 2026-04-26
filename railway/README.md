# Railway Deployment

This directory contains service config files for deploying Multica on Railway as three services: `frontend`, `backend`, and `pgvector`.

**Template Description:**
Multica is an open-source platform for building, managing, and orchestrating AI agents that execute directly on your infrastructure. This template deploys the full stack: a Go backend, a Next.js frontend, and a pgvector-enabled PostgreSQL database.

Template v1 uses the public Multica docs site for `/docs` via `DOCS_URL=https://multica.ai`. Add a separate docs service later only if the template must be fully self-contained.

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

## Backend Variables

```text
VARIABLE: DATABASE_URL
VALUE: postgres://${{pgvector.POSTGRES_USER}}:${{pgvector.POSTGRES_PASSWORD}}@${{pgvector.RAILWAY_PRIVATE_DOMAIN}}:5432/${{pgvector.POSTGRES_DB}}?sslmode=disable
DESCRIPTION: The connection string for the PostgreSQL database (including credentials and domain).

VARIABLE: DATABASE_MAX_CONNS
VALUE: 10
DESCRIPTION: The maximum number of simultaneous connections to the database.

VARIABLE: DATABASE_MIN_CONNS
VALUE: 2
DESCRIPTION: The minimum number of idle connections to keep open in the database pool.

VARIABLE: PORT
VALUE: 8080
DESCRIPTION: The port on which the Go backend API will listen (usually 8080).

VARIABLE: APP_ENV
VALUE: production
DESCRIPTION: The execution environment (set to production for Railway).

VARIABLE: JWT_SECRET
VALUE: ${{secret(64, "abcdef0123456789")}}
DESCRIPTION: Secret key used to sign and verify authentication tokens (generate a secret).

VARIABLE: FRONTEND_ORIGIN
VALUE: https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
DESCRIPTION: The public URL of your frontend service (used for CORS and auth redirects).

VARIABLE: CORS_ALLOWED_ORIGINS
VALUE: https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
DESCRIPTION: Comma-separated list of origins allowed to make cross-site requests to the API.

VARIABLE: MULTICA_APP_URL
VALUE: https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
DESCRIPTION: The primary public URL used to access the Multica application.

VARIABLE: LOCAL_UPLOAD_DIR
VALUE: /app/data/uploads
DESCRIPTION: Path to the directory where uploaded assets and logs are stored.

VARIABLE: LOCAL_UPLOAD_BASE_URL
VALUE: https://${{backend.RAILWAY_PUBLIC_DOMAIN}}
DESCRIPTION: The base public URL used to serve locally uploaded files (usually the backend domain).

VARIABLE: REALTIME_METRICS_TOKEN
VALUE: ${{secret(64, "abcdef0123456789")}}
DESCRIPTION: Secret token required to access the internal real-time performance metrics endpoint (generate a secret).

VARIABLE: ANALYTICS_DISABLED
VALUE: true
DESCRIPTION: Set to true to opt-out of telemetry and usage tracking.

VARIABLE: ALLOW_SIGNUP
VALUE: true
DESCRIPTION: Set to true to allow new users to register on this instance.

VARIABLE: ALLOWED_EMAIL_DOMAINS
VALUE: 
DESCRIPTION: Comma-separated list of email domains (e.g., company.com) allowed to sign up.

VARIABLE: ALLOWED_EMAILS
VALUE: 
DESCRIPTION: Comma-separated list of specific email addresses allowed to sign up.

VARIABLE: RESEND_API_KEY
VALUE: 
DESCRIPTION: API key for the Resend email delivery service (optional for local logs).

VARIABLE: RESEND_FROM_EMAIL
VALUE: 
DESCRIPTION: The verified sender email address for Resend notifications.

VARIABLE: GOOGLE_CLIENT_ID
VALUE: 
DESCRIPTION: The Google OAuth2 Client ID for social authentication.

VARIABLE: GOOGLE_CLIENT_SECRET
VALUE: 
DESCRIPTION: The Google OAuth2 Client Secret for social authentication.

VARIABLE: GOOGLE_REDIRECT_URI
VALUE: https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}/auth/callback
DESCRIPTION: The OAuth2 callback URL for Google login (must match your Google Cloud Console).

VARIABLE: RAILWAY_DOCKERFILE_PATH
VALUE: Dockerfile
DESCRIPTION: Path to the Dockerfile used to build the backend service (usually Dockerfile).
```

Mount `backend-volume` at `/app/data/uploads`. Keep the backend at one replica while using local volume uploads; use S3-compatible object storage and a CDN before scaling replicas.

## Frontend Variables

```text
VARIABLE: PORT
VALUE: 3000
DESCRIPTION: The port on which the Next.js server will listen (usually 3000).

VARIABLE: HOSTNAME
VALUE: 0.0.0.0
DESCRIPTION: The network interface the server binds to (set to 0.0.0.0 for Railway).

VARIABLE: REMOTE_API_URL
VALUE: http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080
DESCRIPTION: The internal Railway URL used by the frontend to proxy requests to the backend.

VARIABLE: NEXT_PUBLIC_APP_VERSION
VALUE: railway-template
DESCRIPTION: A version identifier for the frontend build (e.g., railway-template).

VARIABLE: DOCS_URL
VALUE: https://multica.ai
DESCRIPTION: The URL where the application documentation is hosted (defaults to https://multica.ai).

VARIABLE: RAILWAY_DOCKERFILE_PATH
VALUE: Dockerfile.web
DESCRIPTION: Path to the Dockerfile used to build the web service (usually Dockerfile.web).
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
