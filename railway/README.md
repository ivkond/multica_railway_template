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

## Template Composer Copy-Paste Reference

Follow this guide to fill out the **Template Composer** in the Railway UI. Copy each field individually to ensure accuracy.

---

### Backend: DATABASE_URL
**Name:**
`DATABASE_URL`

**Default Value:**
`postgres://${{pgvector.POSTGRES_USER}}:${{pgvector.POSTGRES_PASSWORD}}@${{pgvector.RAILWAY_PRIVATE_DOMAIN}}:5432/${{pgvector.POSTGRES_DB}}?sslmode=disable`

**Description:**
`The connection string for the PostgreSQL database (including credentials and domain).`

---

### Backend: JWT_SECRET
**Name:**
`JWT_SECRET`

**Default Value:**
`${{secret(64, "abcdef0123456789")}}`

**Description:**
`Secret key used to sign and verify authentication tokens (generate a secret).`

---

### Backend: FRONTEND_ORIGIN
**Name:**
`FRONTEND_ORIGIN`

**Default Value:**
`https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}`

**Description:**
`The public URL of your frontend service (used for CORS and auth redirects).`

---

### Backend: GOOGLE_REDIRECT_URI
**Name:**
`GOOGLE_REDIRECT_URI`

**Default Value:**
`https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}/auth/callback`

**Description:**
`The OAuth2 callback URL for Google login (must match your Google Cloud Console).`

---

### Backend: REALTIME_METRICS_TOKEN
**Name:**
`REALTIME_METRICS_TOKEN`

**Default Value:**
`${{secret(64, "abcdef0123456789")}}`

**Description:**
`Secret token required to access the internal real-time performance metrics endpoint (generate a secret).`

---

### Frontend: REMOTE_API_URL
**Name:**
`REMOTE_API_URL`

**Default Value:**
`http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080`

**Description:**
`The internal Railway URL used by the frontend to proxy requests to the backend.`

---

### Quick Copy: Static Backend Values
| Name | Default Value | Description |
| :--- | :--- | :--- |
| **PORT** | `8080` | The port on which the Go backend API will listen. |
| **APP_ENV** | `production` | The execution environment (set to production). |
| **LOCAL_UPLOAD_DIR** | `/app/data/uploads` | Path to the directory for uploaded assets. |
| **ANALYTICS_DISABLED** | `true` | Set to true to opt-out of telemetry. |
| **ALLOW_SIGNUP** | `true` | Set to true to allow new users to register. |
| **RAILWAY_DOCKERFILE_PATH** | `Dockerfile` | Path to the backend Dockerfile. |

### Quick Copy: Static Frontend Values
| Name | Default Value | Description |
| :--- | :--- | :--- |
| **PORT** | `3000` | The port on which the Next.js server will listen. |
| **HOSTNAME** | `0.0.0.0` | Bind to all network interfaces for Railway. |
| **DOCS_URL** | `https://multica.ai` | URL for the external application documentation. |
| **RAILWAY_DOCKERFILE_PATH** | `Dockerfile.web` | Path to the web Dockerfile. |

---

### Optional/Manual Setup
These variables should be left empty by default in the template:
*   `ALLOWED_EMAILS`: Comma-separated list of allowed user emails.
*   `ALLOWED_EMAIL_DOMAINS`: Comma-separated list of allowed domains (e.g. company.com).
*   `RESEND_API_KEY`: API key for email delivery (optional).
*   `GOOGLE_CLIENT_ID`: Google OAuth2 Client ID.
*   `GOOGLE_CLIENT_SECRET`: Google OAuth2 Client Secret.

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
