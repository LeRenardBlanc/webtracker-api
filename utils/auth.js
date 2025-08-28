import admin from 'firebase-admin';
import { DB } from './db.js';
import { sha256Base16, verifyEd25519Signature } from './crypto.js';

// Initialize Firebase Admin SDK once
if (!admin.apps?.length) {
  const pk = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: pk
      })
    });
  } catch (err) {
    console.warn('Firebase Admin init skipped or failed:', err.message);
  }
}

/**
 * Verify a Firebase ID token from the Authorization header.
 * Expects `Authorization: Bearer <idToken>`.
 * Returns the decoded token object (with `uid`) on success, or null on failure.
 */
export async function verifyFirebaseIdToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const idToken = authHeader.split(' ')[1];
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    console.error('verifyFirebaseIdToken error:', err);
    return null;
  }
}

/**
 * Verify a device-signed request using Ed25519.
 * Expects headers:
 *   X-Device-Id: the device_id
 *   X-Ts:       UNIX timestamp (seconds)
 *   X-Nonce:    random nonce
 *   X-Sig:      Base64 signature over signBase
 *
 * The signBase string is:
 *   METHOD\n
 *   FULL_PATH_WITH_QUERY\n
 *   TS\n
 *   NONCE\n
 *   BODY_HASH
 *
 * Where BODY_HASH = sha256Hex(JSON.stringify(body||{}))
 *
 * On success returns `{ ok: true, device }`
 * On failure returns `{ ok: false, error: <message>, status: <httpStatus> }`
 */
export async function verifySignedRequest(req, { expectedPath }) {
  const device_id = req.headers['x-device-id'];
  const ts        = req.headers['x-ts'];
  const nonce     = req.headers['x-nonce'];
  const sig_b64   = req.headers['x-sig'];

  if (!device_id || !ts || !nonce || !sig_b64) {
    return { ok: false, error: 'Missing authentication headers', status: 401 };
  }
  if (!/^[-A-Za-z0-9_]{4,128}$/.test(device_id)) {
    return { ok: false, error: 'Bad device id', status: 401 };
  }

  // Timestamp skew check
  const now = Math.floor(Date.now() / 1000);
  const skew = parseInt(process.env.TIME_SKEW_SEC || '300', 10);
  if (Math.abs(now - parseInt(ts, 10)) > skew) {
    return { ok: false, error: 'Timestamp out of range', status: 401 };
  }

  // Build full path including query
  const method = req.method;
  const urlObj = new URL(req.url, 'http://localhost');
  const fullPath = urlObj.pathname + urlObj.search;
  if (expectedPath && urlObj.pathname !== expectedPath) {
    return { ok: false, error: 'Bad request path', status: 400 };
  }

  // Recompute body hash using the raw buffer if available
  let rawBody;
  if (typeof req.rawBody === 'string') {
    rawBody = req.rawBody;
  } else if (Buffer.isBuffer(req.rawBody)) {
    rawBody = req.rawBody.toString();
  } else {
    rawBody = JSON.stringify(req.body || {});
  }
  const bodyHash = sha256Base16(rawBody);
  const signBase = `${method}\n${fullPath}\n${ts}\n${nonce}\n${bodyHash}`;

  // Fetch the device row to get its pubkey
  const { data: device, error: devErr } = await DB.getDevice(device_id);
  if (devErr || !device) {
    return { ok: false, error: 'Unknown device', status: 401 };
  }

  // Insert nonce to prevent replay; on conflict this will error
  const { error: nonceErr } = await DB.insertNonce(nonce, device_id, parseInt(ts, 10));
  if (nonceErr) {
    return { ok: false, error: 'Nonce already used', status: 401 };
  }

  // Verify signature
  let verified = false;
  try {
    verified = verifyEd25519Signature({
      signBase,
      sigB64: sig_b64,
      pubkeyB64: device.pubkey
    });
  } catch (e) {
    console.error('Signature verification threw:', e);
  }
  if (!verified) {
    return { ok: false, error: 'Signature verification failed', status: 401 };
  }

  return { ok: true, device };
}
