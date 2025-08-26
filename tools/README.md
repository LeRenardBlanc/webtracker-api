Test scripts for backend

Files:
- `simulate-device.js` — simulate a device requesting a link code from `/api/generate-device-code`.
- `simulate-link.js` — simulate the frontend redeeming a code at `/api/link-device` (requires a Firebase ID token).

Usage examples
1. Start backend locally: set `backend/.env` with SUPABASE and FIREBASE_PRIVATE_KEY, then:

```bash
cd backend
npm install
npm run dev
```

2. Simulate a device:

```bash
# optional: set BACKEND_URL if server runs on a different port
BACKEND_URL=http://localhost:4001 node tools/simulate-device.js my-device-123
```

3. Get a Firebase ID token (from browser):
- In the frontend after signing in, open the browser console and run:
  `firebase.auth().currentUser.getIdToken().then(t => console.log(t))`
- Copy the token printed and run:

```bash
ID_TOKEN=<token> node tools/simulate-link.js <code-from-previous-step> "My device"
```

Notes
- The simulate-link script expects a valid Firebase ID token with a user account present in Firebase.
- Ensure the Supabase tables (`device_links`, `devices`) exist before running tests.
