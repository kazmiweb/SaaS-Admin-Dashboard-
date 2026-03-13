# Backend Contract Analysis

This document maps the active backend modules in `backend/src/modules` to their current route surface and the admin/user UI coverage as of 2026-03-08.

## Mounted Routers

- `/auth`
  - OTP signup flow, login, device reset, refresh, logout
- `/me`
  - Current user profile, theme, disclaimer, password change
  - Allowed services, search history, transactions, notifications, dashboard search
- `/admin`
  - Stats, metrics, users, user lifecycle, notifications
  - APIs, services, service mappings, per-user service access
  - API health, realtime summaries, exports, audit, security feeds
- `/reseller`
  - Reseller-managed user CRUD, credits, device reset
- `/search`
  - Authenticated unified search, family tree, orchestrated search
- `/api`
  - API-key protected search endpoints
- `/export`
  - PDF export

## Key Admin Areas

### API + Service Management

- `GET /admin/apis`
- `POST /admin/apis`
- `PUT /admin/apis/:id`
- `POST /admin/apis/:id/test`
- `DELETE /admin/apis/:id`
- `POST /admin/apis/:id/toggle`
- `GET /admin/services`
- `POST /admin/services`
- `PUT /admin/services/:id`
- `DELETE /admin/services/:id`
- `POST /admin/services/:id/toggle`
- `GET /admin/service-api-matrix`
- `PUT /admin/services/:id/apis`

### API Health + Realtime

- `GET /admin/api-health`
- `POST /admin/api-health/:id/toggle`
- `POST /admin/api-health/:id/priority`
- `POST /admin/api-health/:id/probe`
- `GET /admin/realtime/health`
- `GET /admin/realtime/search-throughput`
- `GET /admin/realtime/active-users`
- `GET /admin/realtime/errors`
- `GET /admin/realtime/load`

### User + Access Control

- `GET /admin/users`
- `POST /admin/users`
- `POST /admin/users/:id/reset-device`
- `GET /admin/users-full`
- `POST /admin/users-full`
- `POST /admin/users-full/:id/status`
- `POST /admin/users-full/:id/add-coins`
- `POST /admin/users-full/:id/extend-expiry`
- `DELETE /admin/users-full/:id`
- `GET /admin/users/:id/services`
- `PUT /admin/users/:id/services`
- `POST /admin/notifications/send`

### Transactions + Exports

- `GET /admin/transactions`
- `GET /admin/exports/users.csv`
- `GET /admin/exports/transactions.csv`
- `GET /admin/exports/activity.csv`
- `GET /admin/exports/api-performance.csv`
- `GET /admin/exports/revenue.csv`

### Audit + Security

- `GET /admin/activity-logs`
- `GET /admin/api-error-logs`
- `GET /admin/audit/admin-actions`
- `GET /admin/audit/security-events`
- `GET /admin/security/summary`
- `GET /admin/security/ip-abuse`
- `GET /admin/security/auth-failures`
- `POST /admin/security/users/:id/suspend`
- `POST /admin/security/users/:id/blacklist`
- `POST /admin/security/users/:id/reset-device`

## Search Contract Notes

- Web search routes now accept both `service` and `serviceName` for unified search.
- Unified search filters mapped APIs by:
  - user role access
  - service + mapping enabled state
  - API enabled state
  - query support flags such as `supportsCnic`, `supportsPhone`, `supportsReg`, etc.

## Gaps Closed In This Pass

- Frontend admin UI now exposes:
  - API health overview and probe/toggle actions
  - per-user service access controls
  - blacklist action from user management
  - auth-failure and IP-abuse security feeds
  - audit/admin-action/security-event/API-error feeds
  - transaction exports with date and billing filters
  - advanced API config fields persisted by backend:
    - description
    - session login config
    - stored rate-limit config

## Remaining Caveats

- `SESSION_LOGIN` and `OAUTH2` auth modes are now stored from admin UI, but runtime execution in `runApiCall.ts` is still implemented only for:
  - `NONE`
  - `API_KEY_HEADER`
  - `BEARER_TOKEN`
  - `BASIC_AUTH`
- Stored rate-limit values are persisted for admin/config visibility, but enforcement is not yet applied during outbound API execution.
