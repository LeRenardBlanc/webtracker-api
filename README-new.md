WebTracker — Backend

This backend contains the API and helpers for the WebTracker project. It implements server-side logic, authenticates dashboard users using Firebase, accepts signed device requests, and persists data to Supabase.

Design summary
- Handlers live in `backend/api/*.js`. Each file exports a default `handler(req,res)` that the local `server.js` mounts under `/api/<name>` for testing.
- Helpers are in `backend/utils/`:
  - `auth.js` — Firebase verification and device-signed request verification (nonce + ed25519)
  - `db.js` — Supabase client and helper functions
  - `crypto.js` — hashing/signature helpers
  - `response.js` — jsonOk/jsonErr and CORS helpers

Core endpoints (files)
- `POST /api/generate-device-code` — `backend/api/generate-device-code.js` — device/provisioner requests a short code; inserted into `device_links`.
- `POST /api/link-device` — `backend/api/link-device.js` — frontend redeems code, backend validates, marks link used and inserts `devices` row with `user_id`.
- `POST /api/register-supabase` — `backend/api/register-supabase.js` — upsert user into Supabase after Firebase signup.
- `POST /api/location` — `backend/api/location.js` — device sends signed location payloads.
- `GET /api/notifications` — `backend/api/notifications.js` — device pulls pending notifications (signed).
- `POST /api/trusted`, `DELETE /api/trusted` — `backend/api/trusted.js` — manage trusted locations (Firebase auth required).
- `GET /api/export` — `backend/api/export.js` — export user data (requires Firebase idToken).

Database tables expected (high level)
- `users` — id (firebase uid), email, phone, updated_at
- `device_links` — id, device_id, pubkey, code, expires_at, used
- `devices` — device_id (PK), user_id, pubkey, label, created_at, revoked
- `nonces` — nonce, device_id, ts
- `locations` — user_id, device_id, ts_ms, lat, lon, accuracy_m, speed_mps, provider
- `notifications` — user_id, message, created_at, is_read
- `trusted_locations` — user_id, label, lat, lon, radius_m

Environment variables
Fill a `.env` from `.env.example` (do not commit secrets). Variables referenced across the codebase:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY (preserve newlines as `\\n` in the .env)
- FIREBASE_ADMIN_PROJECT_ID (compat)
- FIREBASE_ADMIN_CLIENT_EMAIL (compat)
- FIREBASE_ADMIN_PRIVATE_KEY (compat)
- PORT (defaults to 4001)
- TIME_SKEW_SEC (defaults to 300)
- NONCE_TTL_SEC (defaults to 300)

Run locally
1. cd backend
2. npm install
3. copy `.env.example` → `.env` and fill in values
4. npm run dev

Developer notes for future AI assistance
- Server-only secrets (Supabase service role, Firebase private key) must remain in backend env and never be exposed to the frontend.
- Device-signed requests: refer to `backend/utils/auth.js` — the canonical sign base is built from method, path, ts, nonce and bodyHash; signatures are Ed25519 (tweetnacl wrapper).
- When adding endpoints, document the request/response contract and update this README and `.env.example`.
