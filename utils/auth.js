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

  console.log('🐛 verifySignedRequest headers:', {
    device_id, ts, nonce, sig_b64,
    url: req.url,
    method: req.method,
    expectedPath
  });

  if (!device_id || !ts || !nonce || !sig_b64) {
    console.error('🐛 Missing authentication headers');
    return { ok: false, error: 'Missing authentication headers', status: 401 };
  }
  if (!/^[-A-Za-z0-9_]{4,128}$/.test(device_id)) {
    console.error('🐛 Bad device id:', device_id);
    return { ok: false, error: 'Bad device id', status: 401 };
  }

  // Timestamp skew check
  const now = Math.floor(Date.now() / 1000);
  const skew = parseInt(process.env.TIME_SKEW_SEC || '300', 10);
  if (Math.abs(now - parseInt(ts, 10)) > skew) {
    console.error('🐛 Timestamp out of range:', { now, ts, skew });
    return { ok: false, error: 'Timestamp out of range', status: 401 };
  }

  // Build the signBase string, including query string
  const method = req.method;
  const urlObj = new URL(req.url, 'http://localhost');
  const fullPath = urlObj.pathname + urlObj.search;
  if (expectedPath && urlObj.pathname !== expectedPath) {
    console.error('🐛 Unexpected path:', urlObj.pathname, 'expected', expectedPath);
    return { ok: false, error: 'Bad request path', status: 400 };
  }

  const rawBody = typeof req.body === 'string'
    ? req.body
    : JSON.stringify(req.body || {});
  const bodyHash = sha256Base16(rawBody);
  const signBase = `${method}\n${fullPath}\n${ts}\n${nonce}\n${bodyHash}`;

  console.log('🐛 Computed signBase:', signBase);

  // Fetch device row and its pubkey
  const { data: device, error: devErr } = await DB.getDevice(device_id);
  if (devErr || !device) {
    console.error('🐛 Unknown device:', device_id, devErr);
    return { ok: false, error: 'Unknown device', status: 401 };
  }
  console.log('🐛 Device pubkey:', device.pubkey);
  if (!device.pubkey) {
    console.error('🐛 Device missing pubkey:', device_id);
    return { ok: false, error: 'Device missing pubkey', status: 401 };
  }

  // Prevent replay via nonce insertion
  const { error: nonceErr } = await DB.insertNonce(nonce, device_id, parseInt(ts, 10));
  if (nonceErr) {
    console.error('🐛 Nonce already used:', nonceErr);
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
    console.error('🐛 Signature verification threw:', e);
  }
  if (!verified) {
    console.error('🐛 Signature verification failed for device:', device_id);
    return { ok: false, error: 'Signature verification failed', status: 401 };
  }

  console.log('✅ Signature OK for device:', device_id);
  return { ok: true, device };
}
