# Elookup Intelligence Search — Production Full Stack

Ready-to-run **Docker Compose** monorepo for the production SaaS **Elookup Intelligence Search**.

## Stack
- **Frontend**: React (Vite) + **Chakra UI** + **Vision UI Dashboard** patterns
- **Backend**: Node.js (Express) + TypeScript
- **DB**: PostgreSQL + Prisma
- **Auth**: JWT access+refresh (**refresh rotation**) + OTP Email signup
- **Cache**: Redis (API response caching + search de-duplication)

## Quick Start (Docker)

1) Copy env templates:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

2) Start everything:
```bash
docker compose up -d --build
```

3) DB schema + seed are applied automatically on backend container start (via `prisma db push` + seed).

If you want to run them manually:
```bash
docker compose exec backend npx prisma db push
docker compose exec backend npm run seed
```

4) Open:
- Frontend: http://localhost:5173
- Backend health: http://localhost:8080/health

## Default Seed Users
- **Admin**: `admin@elookup.local` / `Admin@12345`
- **Reseller**: `reseller@elookup.local` / `Reseller@12345`
- **User**: `user@elookup.local` / `User@12345`

After login redirects:
- **ADMIN** → `/admin/dashboard`
- **RESELLER** → `/reseller/dashboard`
- **USER** → `/user/dashboard`

## Gmail OTP (App Password)

OTP signup uses Nodemailer SMTP. For Gmail:

1) Enable **2‑Step Verification** on the Gmail account.
2) Create an **App Password** (Google Account → Security → App passwords).
3) Update `backend/.env`:

```env
MAIL_FROM="Elookup <your@gmail.com>"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=YOUR_GMAIL_APP_PASSWORD
SMTP_SECURE=false
```

## RBAC

Roles are enforced in both backend and frontend:
- **ADMIN**: Admin dashboard, API management, user management, metrics
- **USER**: Search modules + settings
- **RESELLER**: Full USER access + **User Management** for their created users

## Reseller Business Rules (Coins)

- Reseller can create/update/delete **only USER accounts** they own.
- When reseller creates a user and assigns coins (or later tops-up):
  - coins are **deducted immediately** from reseller
  - coins are **non-refundable**
- After **expiry date**, user coins are treated as **0**.
- If a package is upgraded **before expiry**, remaining coins stay and new coins add.

Reseller endpoints:
- `GET /reseller/users`
- `POST /reseller/users`
- `PUT /reseller/users/:id`
- `DELETE /reseller/users/:id`
- `POST /reseller/users/:id/add-coins`
- `POST /reseller/users/:id/reset-device`

## Core API Endpoints

Auth:
- `POST /auth/request-otp`
- `POST /auth/verify-otp`
- `POST /auth/complete-signup`
- `POST /auth/login`
- `POST /auth/refresh` (rotation)
- `POST /auth/logout`

Session-based web auth (USER/RESELLER):
- USER/RESELLER logins also create an **HttpOnly session cookie** for dashboard calls.

Single-device auth (USER/RESELLER):
- `POST /auth/device-reset/request`
- `POST /auth/device-reset/verify`

Me:
- `GET /me`
- `POST /me/accept-disclaimer`
- `POST /me/theme`
- `POST /me/change-password`
- `GET /me/search-history`
- `GET /me/transactions`

Search:
- `GET /search/unified?query=...`

Programmatic API (JWT Access Keys):
- `GET /api/search/unified?query=...&service=...`
- `GET /api/search/family-tree?cnic=...`

Admin API keys:
- `GET /admin/api-keys`
- `POST /admin/api-keys`
- `DELETE /admin/api-keys/:id`

Export:
- `POST /export/pdf`

Admin metrics:
- `GET /admin/metrics/summary`
- `GET /admin/metrics/revenue-12m`

## Performance Settings

Backend env flags:
```env
SEARCH_CACHE_TTL_SEC=180
SEARCH_MAX_CONCURRENCY=5
```

## Frontend Configuration

Set backend base URL in `frontend/.env`:
```env
VITE_API_BASE_URL=http://localhost:8080
```

## Troubleshooting

- If OTP emails don’t arrive, verify Gmail **App Password** and SMTP config.
- If Prisma engine downloads fail in a restricted environment, build images on a machine with internet access.
