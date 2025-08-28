import admin from 'firebase-admin';
import { DB } from './db.js';
import { sha256Base16, verifyEd25519Signature } from './crypto.js';

// Init Firebase Admin once
if (!admin.apps.length) {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  const pk = FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: pk
    })
  });
}

export async function verifyFirebaseIdToken(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.substring(7);
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded; // includes uid, phone_number (if verified), etc.
  } catch {
    return null;
  }
}

export async function verifySignedRequest(req, { expectedPath }) {
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

  const method = req.method;
  const path = new URL(req.url, 'http://localhost').pathname;
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const bodyHash = sha256Base16(rawBody);
  const signBase = `${method}\n${path}\n${ts}\n${nonce}\n${bodyHash}`;

  // Fetch device public key
  const { data: device, error: devErr } = await DB.getDevice(device_id);
  if (devErr || !device) {
    return { ok: false, error: 'Unknown device', status: 401 };
  }
  if (!device.pubkey) {
    return { ok: false, error: 'Device missing pubkey', status: 401 };
  }

  // Insert nonce (unique constraint prevents replay)
  const { error: nonceErr } = await DB.insertNonce(nonce, device_id, parseInt(ts, 10));
  if (nonceErr) {
    return { ok: false, error: 'Nonce already used', status: 401 };
  }

  // Verify signature (guard against exceptions)
  try {
    const ok = verifyEd25519Signature({ signBase, sigB64: sig_b64, pubkeyB64: device.pubkey });
    if (!ok) {
      return { ok: false, error: 'Signature verification failed', status: 401 };
    }
  } catch {
    return { ok: false, error: 'Signature verification failed', status: 401 };
  }

  return { ok: true, device };
}
