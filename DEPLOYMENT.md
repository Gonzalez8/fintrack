# Fintrack - Production Deployment

## Architecture

```
Internet → Nginx Proxy Manager (HTTPS) → Frontend (Next.js :8080) → Backend (Django :8001)
                                                                   → Celery Worker
                                                                   → Celery Beat
                                                                   → PostgreSQL
                                                                   → Redis
```

## Prerequisites

- Docker + Docker Compose (or Portainer)
- A reverse proxy with SSL (e.g., Nginx Proxy Manager)
- Domain pointing to your server

## Quick Deploy (Portainer)

1. Create a new Stack in Portainer
2. Paste the contents of `docker-compose.prod.yml`
3. Add environment variables (see below)
4. Deploy

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_PASSWORD` | **Yes** | - | PostgreSQL password |
| `DJANGO_SECRET_KEY` | **Yes** | - | Django secret key (generate with `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`) |
| `DB_NAME` | No | `fintrack` | Database name |
| `DB_USER` | No | `fintrack` | Database user |
| `ALLOWED_HOSTS` | No | `*` | Comma-separated hostnames (e.g., `fintrack.example.com,localhost`). The Docker internal hostname `backend` is added automatically. |
| `CORS_ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated origins (e.g., `https://fintrack.example.com`) |
| `CSRF_TRUSTED_ORIGINS` | No | Same as CORS | Comma-separated origins for CSRF (e.g., `https://fintrack.example.com`) |
| `APP_PORT` | No | `8080` | Host port for the frontend |
| `DJANGO_SUPERUSER_USERNAME` | No | `admin` | Initial admin username |
| `DJANGO_SUPERUSER_PASSWORD` | No | `admin` | Initial admin password |
| `DJANGO_SUPERUSER_EMAIL` | No | `admin@fintrack.local` | Initial admin email |
| `ALLOW_REGISTRATION` | No | `true` | Allow new user registration |
| `GOOGLE_CLIENT_ID` | No | - | Google OAuth client ID |

### Example `.env` for production

```env
DB_PASSWORD=your-secure-db-password
DJANGO_SECRET_KEY=your-django-secret-key
ALLOWED_HOSTS=fintrack.example.com,localhost
CORS_ALLOWED_ORIGINS=https://fintrack.example.com
CSRF_TRUSTED_ORIGINS=https://fintrack.example.com
ALLOW_REGISTRATION=false
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_PASSWORD=change-me-now
```

## Reverse Proxy Setup (Nginx Proxy Manager)

1. Add a Proxy Host:
   - **Domain**: `fintrack.example.com`
   - **Scheme**: `http`
   - **Forward Hostname/IP**: your server's local IP (e.g., `192.168.1.171`)
   - **Forward Port**: `8080` (or your `APP_PORT`)
   - **Websockets Support**: enabled
2. Enable SSL (Let's Encrypt) in the SSL tab
3. The Django admin panel is accessible at `http://<server-ip>:8001/admin/`
   - Add the server IP to `ALLOWED_HOSTS` if you want to access it directly

## Ports

| Service | Internal | External (host) |
|---|---|---|
| Frontend (Next.js) | 3000 | `APP_PORT` (default: 8080) |
| Backend (Django) | 8000 | 8001 |
| PostgreSQL | 5432 | not exposed |
| Redis | 6379 | not exposed |

## Startup Sequence

The backend container automatically runs on startup:
1. `migrate` - Apply database migrations
2. `collectstatic` - Collect static files
3. `createsuperuser` - Create admin user (skips if already exists)
4. `gunicorn` - Start the application server

## Updating

After pushing changes to `main`, GitHub Actions rebuilds the Docker images. To update:

1. In Portainer: Stack → Editor → "Update the stack" with "Re-pull image" enabled
2. Or via CLI: `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Bad Request (400)` | `ALLOWED_HOSTS` missing your domain | Add domain to `ALLOWED_HOSTS` |
| `ECONNREFUSED` on login | Backend not ready yet | Wait for healthcheck (backend has `start_period: 30s`) |
| `502 Bad Gateway` | Backend crashed | Check backend logs: `docker logs fintrack-backend-1` |
| Admin login fails | Superuser not created | Check `DJANGO_SUPERUSER_USERNAME/PASSWORD` env vars are set |
