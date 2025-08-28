# Android Client Implementation Guide

This document provides the correct implementation patterns for Android clients connecting to the WebTracker API.

## Issue: 401 Unauthorized Errors

If you're receiving 401 errors when calling API endpoints, it's likely because your Android client is not properly signing requests that require device authentication.

## Authentication Requirements

The WebTracker API uses two authentication methods:

1. **Firebase Auth** (for web dashboard users)
2. **Signed Device Requests** (for Android devices)

## Signed Device Requests

Android devices must sign their requests using Ed25519 signatures with these headers:
- `X-Device-Id`: Your device ID
- `X-Ts`: Current timestamp in seconds 
- `X-Nonce`: Unique nonce to prevent replay attacks
- `X-Sig`: Base64-encoded Ed25519 signature

## Correct Android Implementation

### ❌ INCORRECT: Direct HTTP requests

```kotlin
// DON'T DO THIS - Will result in 401 errors
suspend fun getNotifications(ctx: Context): String? = withContext(Dispatchers.IO) {
    try {
        val deviceId = Prefs.deviceId(ctx)
        val url = BuildConfig.API_BASE + "/api/notifications?device_id=$deviceId"
        val client = OkHttpClient()

        val request = Request.Builder()
            .url(url)
            .get()
            .build()

        val response: Response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            Log.e("WebTrackerApi", "Failed getNotifications: ${response.code}")
            return@withContext null
        }
        response.body?.string()
    } catch (e: Exception) {
        Log.e("WebTrackerApi", "Error in getNotifications", e)
        null
    }
}
```

### ✅ CORRECT: Using signed requests

```kotlin
// DO THIS - Uses proper signing via Net.getSigned()
suspend fun getNotifications(ctx: Context): String? = withContext(Dispatchers.IO) {
    try {
        val response = Net.getSigned(ctx, "/api/notifications", Prefs.deviceId(ctx))
        if (response.isSuccessful) {
            response.body?.string()
        } else {
            Log.e("WebTrackerApi", "Failed getNotifications: ${response.code}")
            null
        }
    } catch (e: Exception) {
        Log.e("WebTrackerApi", "Error in getNotifications", e)
        null
    }
}
```

## Net Signing Helper Methods

Your Android client needs these methods in the `Net` class:

- `Net.getSigned(ctx, path, deviceId)` - For GET requests  
- `Net.postSigned(ctx, path, body, deviceId)` - For POST requests
- `Net.deleteSigned(ctx, path, deviceId)` - For DELETE requests (may need to be implemented)

If `Net.deleteSigned()` doesn't exist in your client, you'll need to implement it following the same signing pattern as the GET and POST methods.

## API Endpoints Requiring Signed Requests

All these endpoints require signed device requests when called from Android:

- `GET /api/notifications` - Get pending notifications
- `GET /api/trusted` - Get trusted locations  
- `POST /api/trusted` - Add trusted location (can also use Firebase auth)
- `DELETE /api/trusted` - Remove trusted location (can also use Firebase auth)
- `POST /api/location` - Submit location data
- `GET /api/export` - Export user data

## Complete WebTrackerApi Object

Here's the corrected implementation for all API methods:

```kotlin
object WebTrackerApi {
    data class TrustedLocation(val id: String, val latitude: Double, val longitude: Double, val radius: Double)

    suspend fun getNotifications(ctx: Context): String? = withContext(Dispatchers.IO) {
        try {
            val response = Net.getSigned(ctx, "/api/notifications", Prefs.deviceId(ctx))
            if (response.isSuccessful) {
                response.body?.string()
            } else {
                Log.e("WebTrackerApi", "Failed getNotifications: ${response.code}")
                null
            }
        } catch (e: Exception) {
            Log.e("WebTrackerApi", "Error in getNotifications", e)
            null
        }
    }

    fun getTrustedLocations(ctx: Context): List<TrustedLocation> {
        return try {
            val response = Net.getSigned(ctx, "/api/trusted", Prefs.deviceId(ctx))
            if (response.isSuccessful) {
                val json = response.body?.string()
                if (json != null) {
                    val type = object : TypeToken<List<TrustedLocation>>() {}.type
                    Gson().fromJson(json, type)
                } else {
                    emptyList()
                }
            } else {
                Log.e("WebTrackerApi", "Failed to get trusted locations: ${response.code}")
                emptyList()
            }
        } catch (e: Exception) {
            Log.e("WebTrackerApi", "Error getting trusted locations", e)
            emptyList()
        }
    }

    fun addTrustedLocation(ctx: Context, latitude: Double, longitude: Double, radius: Double): Boolean {
        val body = mapOf("lat" to latitude, "lon" to longitude, "radius_m" to radius)
        return try {
            val response = Net.postSigned(ctx, "/api/trusted", body, Prefs.deviceId(ctx))
            response.isSuccessful
        } catch (e: Exception) {
            Log.e("WebTrackerApi", "Error adding trusted location", e)
            false
        }
    }

    fun removeTrustedLocation(ctx: Context, locationId: String): Boolean {
        return try {
            // Option 1: If your Net class supports DELETE requests (recommended)
            val path = "/api/trusted?id=$locationId"
            val response = Net.deleteSigned(ctx, path, Prefs.deviceId(ctx))
            response.isSuccessful
            
            // Option 2: If Net.deleteSigned() doesn't exist, you can use POST to a custom endpoint
            // You would need to implement the POST /api/trusted/delete endpoint on the server
            // val body = mapOf("id" to locationId)
            // val response = Net.postSigned(ctx, "/api/trusted/delete", body, Prefs.deviceId(ctx))
            // response.isSuccessful
        } catch (e: Exception) {
            Log.e("WebTrackerApi", "Error removing trusted location", e)
            false
        }
    }

    fun getDeviceLinkCode(ctx: Context): String? {
        val body = mapOf("device_id" to Prefs.deviceId(ctx))
        return try {
            val response = Net.postSigned(ctx, "/api/generate-device-code", body, Prefs.deviceId(ctx))
            if (response.isSuccessful) {
                val json = response.body?.string()
                val map: Map<String, Any> = Gson().fromJson(json, object : TypeToken<Map<String, Any>>() {}.type)
                map["code"]?.toString()
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e("WebTrackerApi", "Error getting device link code", e)
            null
        }
    }

    fun exportData(ctx: Context, from: Long, to: Long, format: String): String? {
        val path = "/api/export?from=$from&to=$to&format=$format"
        return try {
            val response = Net.getSigned(ctx, path, Prefs.deviceId(ctx))
            if (response.isSuccessful) {
                response.body?.string()
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e("WebTrackerApi", "Error exporting data", e)
            null
        }
    }
}
```

## Key Changes Made

1. **Fixed `getNotifications()`**: Now uses `Net.getSigned()` instead of direct OkHttpClient
2. **Simplified error handling**: Consistent pattern across all methods  
3. **Proper response format**: All methods now match the expected API response format
4. **Updated `removeTrustedLocation()`**: Now uses proper DELETE method instead of POST /trusted/delete

## Important Notes

- **DELETE vs POST for removing trusted locations**: The server expects `DELETE /api/trusted?id=X`, but if your existing Android code uses `POST /api/trusted/delete` and you can't change it easily, you may need to implement a custom server endpoint.
- **Net.deleteSigned() method**: Make sure your `Net` helper class has a `deleteSigned()` method, or implement it following the same signing pattern as GET and POST methods.

## Testing Your Implementation

To test that your Android client is working correctly:

1. Ensure your device is properly linked and has valid Ed25519 keys
2. Check that `Net.getSigned()` and `Net.postSigned()` are correctly implementing the signing algorithm
3. Verify the signature verification matches the server's expectations (method + path + timestamp + nonce + bodyHash)

If you're still getting 401 errors after implementing these changes, check:
- Device ID is correctly registered in the database
- Ed25519 keys match between client and server
- System time is synchronized (timestamp skew tolerance is 5 minutes by default)
- Nonces are unique and not being reused