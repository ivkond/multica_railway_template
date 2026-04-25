# Railway Deployment

This directory contains service config files for deploying Multica on Railway as three services: `frontend`, `backend`, and `pgvector`.

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
- Set `POSTGRES_DB=multica` and `POSTGRES_USER=multica`.
- Generate `POSTGRES_PASSWORD=${{secret(64, "abcdef0123456789")}}` per deployment.
- Set `PGDATA=/var/lib/postgresql/data/pgdata`.

## Backend Variables

```text
DATABASE_URL=postgres://${{pgvector.POSTGRES_USER}}:${{pgvector.POSTGRES_PASSWORD}}@${{pgvector.RAILWAY_PRIVATE_DOMAIN}}:5432/${{pgvector.POSTGRES_DB}}?sslmode=disable
DATABASE_MAX_CONNS=10
DATABASE_MIN_CONNS=2
PORT=8080
APP_ENV=production
JWT_SECRET=${{secret(64, "abcdef0123456789")}}
FRONTEND_ORIGIN=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
CORS_ALLOWED_ORIGINS=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
MULTICA_APP_URL=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
LOCAL_UPLOAD_DIR=/app/data/uploads
LOCAL_UPLOAD_BASE_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}
REALTIME_METRICS_TOKEN=${{secret(64, "abcdef0123456789")}}
ANALYTICS_DISABLED=true
ALLOW_SIGNUP=true
ALLOWED_EMAIL_DOMAINS=
ALLOWED_EMAILS=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}/auth/callback
```

Mount `backend-volume` at `/app/data/uploads`. Keep the backend at one replica while using local volume uploads; use S3-compatible object storage and a CDN before scaling replicas.

## Frontend Variables

```text
PORT=3000
HOSTNAME=0.0.0.0
REMOTE_API_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080
NEXT_PUBLIC_APP_VERSION=railway-template
DOCS_URL=https://multica.ai
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
