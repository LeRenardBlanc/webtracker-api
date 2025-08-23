# WebTracker API — Vercel Serverless Functions

**Tech Stack:** Node 18 (ESM), Supabase, Firebase Admin, TweetNaCl

Place this folder as a standalone project or inside your Next.js app root.
Endpoints live under `/api/*` (Vercel convention).

## Project Structure

```
├── api/
│   ├── health.js       # Health check endpoint
│   ├── location.js     # POST location data (device signed)
│   ├── notifications.js # GET notifications (device signed)
│   ├── trusted.js      # POST/DELETE trusted locations (Firebase auth)
│   └── export.js       # GET export data as GPX/JSON (Firebase auth)
├── utils/
│   ├── response.js     # HTTP response helpers
│   ├── db.js          # Supabase database helpers
│   ├── crypto.js      # Cryptographic utilities
│   └── auth.js        # Authentication utilities
├── package.json
├── vercel.json
└── .env.example       # Environment variables template
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your actual values:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `FIREBASE_PROJECT_ID`: Firebase project ID
- `FIREBASE_CLIENT_EMAIL`: Firebase service account email
- `FIREBASE_PRIVATE_KEY`: Firebase service account private key
- `TIME_SKEW_SEC`: Allowed time skew for signatures (default: 300)
- `NONCE_TTL_SEC`: Nonce time-to-live (default: 300)

## Setup

1. Install dependencies: `npm install`
2. Configure environment variables
3. Deploy to Vercel or run locally with `vercel dev`
