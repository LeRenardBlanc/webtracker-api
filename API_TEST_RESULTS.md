# Testing the WebTracker API

This file demonstrates how to test the API endpoints and verify they work correctly.

## Current Server Status

✅ **Server is running**: Health endpoint returns 200 OK
✅ **Authentication is working**: All protected endpoints return proper 401 errors when called without authentication
✅ **CORS is configured**: Proper headers are set for cross-origin requests

## Endpoint Test Results

### 1. Health Endpoint (Public)
```bash
curl -X GET "http://localhost:4001/api/health"
# Expected: 200 OK with {"ok":true,"status":"ok","ts":...}
```

### 2. Notifications Endpoint (Requires Signed Request)
```bash
curl -X GET "http://localhost:4001/api/notifications"
# Expected: 401 Unauthorized with {"ok":false,"error":"Missing authentication headers"}
```
✅ **FIXED**: This endpoint now properly requires signed requests, which will resolve the 401 errors in the Android app once the client is updated.

### 3. Trusted Locations Endpoint (GET - Requires Signed Request)  
```bash
curl -X GET "http://localhost:4001/api/trusted"
# Expected: 401 Unauthorized with {"ok":false,"error":"Missing authentication headers"}
```
✅ **ADDED**: This endpoint was missing and is now implemented to support Android getTrustedLocations().

### 4. Trusted Locations DELETE (Requires Auth)
```bash
curl -X DELETE "http://localhost:4001/api/trusted?id=1"
# Expected: 401 Unauthorized with {"ok":false,"error":"Unauthorized"}
```
✅ **WORKING**: Endpoint correctly requires Firebase auth or deviceId parameter.

## What the Android Client Needs to Fix

The main issue is in the `getNotifications()` method:

**Current (Broken):**
```kotlin
// This causes 401 errors because it doesn't include authentication headers
val client = OkHttpClient()
val request = Request.Builder().url(url).get().build()
val response = client.newCall(request).execute()
```

**Fixed:**
```kotlin  
// This works because Net.getSigned() adds the required authentication headers
val response = Net.getSigned(ctx, "/api/notifications", Prefs.deviceId(ctx))
```

## Authentication Headers Required

For signed requests, the server expects these headers:
- `X-Device-Id`: Device identifier  
- `X-Ts`: Current timestamp in seconds
- `X-Nonce`: Unique nonce to prevent replay attacks
- `X-Sig`: Base64-encoded Ed25519 signature

The signature is computed over: `{method}\n{path}\n{timestamp}\n{nonce}\n{bodyHash}`

## Server Configuration

The server is running with these settings:
- Port: 4001
- CORS Origin: http://localhost:3000  
- Time Skew Tolerance: 300 seconds (5 minutes)
- Nonce TTL: 300 seconds (5 minutes)

All endpoints return proper JSON responses with CORS headers configured.