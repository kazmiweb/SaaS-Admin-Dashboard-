# API Documentation — Elookup Intelligence Search

Base URL (dev): `http://localhost:8080`

## Auth
### Request OTP (Signup)
`POST /auth/request-otp`
```json
{ "email": "user@example.com" }
```

### Verify OTP
`POST /auth/verify-otp`
```json
{ "email": "user@example.com", "otp": "123456" }
```
Returns:
```json
{ "status": "success", "signupToken": "..." }
```

### Complete Signup
`POST /auth/complete-signup`
```json
{ "signupToken": "...", "name": "User", "password": "StrongPass123" }
```

### Login
`POST /auth/login`
```json
{ "email": "user@example.com", "password": "StrongPass123" }
```

### Refresh Access Token
`POST /auth/refresh`
```json
{ "refreshToken": "..." }
```

## Me
`GET /me` (Bearer access token)

`POST /me/accept-disclaimer` (first login agreement)

`POST /me/theme`
```json
{ "theme": "light" }
```

## Admin (ADMIN only)
`GET /admin/stats`

### APIs
- `GET /admin/apis`
- `POST /admin/apis`
- `PUT /admin/apis/:id`
- `POST /admin/apis/:id/test`  `{ "query": "..." }`

### Services
- `GET /admin/services`
- `POST /admin/services`  `{ "name": "...", "apiIds": ["..."] }`

## Search
### Unified
`GET /search/unified?query=4220186578817`

Response:
- detectedType
- results[] per API (ok/data or ok/error)
- cost + remainingCredits

## Export
`POST /export/pdf` with:
```json
{ "title":"Elookup Report", "query":"...", "detectedType":"CNIC", "results":{...} }
```

