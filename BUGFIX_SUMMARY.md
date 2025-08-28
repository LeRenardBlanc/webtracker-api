# WebTracker API - Bug Fixes Summary

## Issues Resolved

This commit fixes critical bugs that were causing 500 errors and unauthorized errors in both the mobile app and webtracker-web frontend.

### 1. Database Table Name Inconsistency ⚡
**Problem**: `api/trusted.js` was using `trusted_places` table while `utils/db.js` helper functions referenced `trusted_locations`.
**Fix**: Standardized on `trusted_locations` throughout the codebase.

### 2. Firebase Authentication Bug 🔐
**Problem**: `verifyFirebaseIdToken` was being called with incorrect parameters in `api/trusted.js`.
**Fix**: Updated to pass the correct `req` object to the Firebase verification function.

### 3. Notifications API Parameter Mismatch 📱
**Problem**: `DB.insertNotification` was called with individual parameters instead of the expected object parameter.
**Fix**: Updated to pass parameters as an object: `{ user_id, device_id, type, payload }`.

### 4. Missing GET Endpoint 📖
**Problem**: No way to retrieve trusted places from the API.
**Fix**: Added GET method to `/api/trusted` endpoint to list trusted places for authenticated users.

### 5. Firebase Initialization Issues 🔥
**Problem**: Duplicate and inconsistent Firebase initialization across files could cause runtime errors.
**Fix**: 
- Centralized Firebase initialization in `utils/auth.js`
- Added proper error handling for missing credentials
- Removed duplicate initialization from `api/register-supabase.js`

### 6. Database Connection Errors 💾
**Problem**: Missing Supabase credentials would cause immediate crashes on module import.
**Fix**: Added graceful handling with mock client when credentials are missing.

### 7. Query Parameter Parsing 🔗
**Problem**: Device ID extraction from query parameters was not robust.
**Fix**: Enhanced parsing to handle both Express.js and Vercel serverless function environments.

## Environment Variables Required

Make sure the following environment variables are properly configured in your deployment:

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Firebase Configuration
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY=your_private_key_with_escaped_newlines

# Optional Configuration
ALLOWED_ORIGIN=https://your-frontend-domain.com
TIME_SKEW_SEC=300
NONCE_TTL_SEC=300
```

## Testing

- ✅ All API endpoints load without crashes
- ✅ Health endpoint returns proper responses 
- ✅ Authentication endpoints return proper 401 for unauthorized requests
- ✅ Firebase authentication works correctly
- ✅ Supabase database operations use consistent table names

## Deployment Notes

1. Ensure all environment variables are set in your hosting platform (Vercel, etc.)
2. The `ALLOWED_ORIGIN` should be set to your actual frontend domain for production security
3. Test the endpoints after deployment to ensure proper functionality
4. Monitor logs for any remaining configuration issues