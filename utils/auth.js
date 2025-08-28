import admin from 'firebase-admin';
import { DB } from './db.js';
import { sha256Base16, verifyEd25519Signature } from './crypto.js';

// Init Firebase Admin once
if (!admin.apps.length) {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.warn('Warning: Firebase credentials not fully configured. Firebase auth will not work.');
  } else {
    try {
      const pk = FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: pk
        })
      });
    } catch (error) {
      console.error('Failed to initialize Firebase Admin:', error.message);
    }
  }
}

export async function verifyFirebaseIdToken(req) {
  if (!admin.apps.length) {
    console.warn('Firebase Admin not initialized, cannot verify tokens');
    return null;
  }
  
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.substring(7);
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded; // includes uid, phone_number (if verified), etc.
  } catch (error) {
    console.warn('Firebase token verification failed:', error.message);
    return null;
  }
}

export async function verifySignedRequest(req, { expectedPath }) {
  // Required headers from device
  const device_id = req.headers['x-device-id'];
  const ts = req.headers['x-ts'];
  const nonce = req.headers['x-nonce'];
  const sig_b64 = req.headers['x-sig'];

  if (!device_id || !ts || !nonce || !sig_b64) {
    return { ok: false, error: 'Missing authentication headers', status: 401 };
  }
  if (!/^[-A-Za-z0-9_]{4,128}$/.test(device_id)) {
    return { ok: false, error: 'Bad device id', status: 401 };
  }

  const now = Math.floor(Date.now() / 1000);
  const skew = parseInt(process.env.TIME_SKEW_SEC || '300', 10);
  if (Math.abs(now - parseInt(ts, 10)) > skew) {
    return { ok: false, error: 'Timestamp out of range', status: 401 };
  }

  // Build sign base string
  const method = req.method;
  const path = new URL(req.url, 'http://localhost').pathname; // Vercel provides absolute path at runtime
  if (expectedPath && path !== expectedPath) {
    // Not critical, but keeps consistent canonical base
  }
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const bodyHash = sha256Base16(rawBody);
  const signBase = `${method}\n${path}\n${ts}\n${nonce}\n${bodyHash}`;

  // Fetch device public key
  const { data: device, error: devErr } = await DB.getDevice(device_id);
  if (devErr || !device) {
    return { ok: false, error: 'Unknown device', status: 401 };
  }

  // Insert nonce (unique constraint prevents replay)
  const { error: nonceErr } = await DB.insertNonce(nonce, device_id, parseInt(ts, 10));
  if (nonceErr) {
    return { ok: false, error: 'Nonce already used', status: 401 };
  }

  // Verify signature
  const ok = verifyEd25519Signature({ signBase, sigB64: sig_b64, pubkeyB64: device.pubkey });
  if (!ok) {
    return { ok: false, error: 'Signature verification failed', status: 401 };
  }

  return { ok: true, device };
}
