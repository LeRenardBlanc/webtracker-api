import admin from 'firebase-admin';
import { DB } from './db.js';
import { sha256Base16, verifyEd25519Signature } from './crypto.js';

// Initialize Firebase Admin SDK once using service account from env
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
    console.log('✅ Firebase Admin initialized');
  } catch (err) {
    console.warn('⚠️ Firebase Admin init failed:', err.message);
  }
}

/**
 * Verify a Firebase ID token from the Authorization header.
 * Expects `Authorization: Bearer <idToken>`.
 * Returns the decoded token object (with `uid`) on success, or null on failure.
 */
export async function verifyFirebaseIdToken(req) {
  const header = req.headers['authorization'] || req.headers['Authorization'];
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    console.log('🔒 verifyFirebaseIdToken: no Bearer token');
    return null;
  }
  const idToken = header.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log('🔓 verifyFirebaseIdToken success for uid=', decoded.uid);
    return decoded;
  } catch (err) {
    console.error('🚫 verifyFirebaseIdToken error:', err.message);
    return null;
  }
}

/**
 * Verify a device-signed request using Ed25519.
 * Expects headers:
 *   X-Device-Id, X-Ts, X-Nonce, X-Sig.
 * Returns `{ ok, device?, error?, status? }`.
 */
export async function verifySignedRequest(req, { expectedPath }) {
  const device_id = req.headers['x-device-id'];
  const ts        = req.headers['x-ts'];
  const nonce     = req.headers['x-nonce'];
  const sig_b64   = req.headers['x-sig'];

  console.log('📝 verifySignedRequest called:', {
    method: req.method,
    url: req.url,
    device_id, ts, nonce, sig_b64: !!sig_b64
  });

  if (!device_id || !ts || !nonce || !sig_b64) {
    return { ok: false, error: 'Missing auth headers', status: 401 };
  }
  if (!/^[-A-Za-z0-9_]{4,128}$/.test(device_id)) {
    return { ok: false, error: 'Bad device id', status: 401 };
  }
  const now = Math.floor(Date.now() / 1000);
  const skew = parseInt(process.env.TIME_SKEW_SEC || '300', 10);
  if (Math.abs(now - parseInt(ts, 10)) > skew) {
    return { ok: false, error: 'Timestamp out of range', status: 401 };
  }

  // build fullPath including query
  const urlObj = new URL(req.url, 'http://localhost');
  if (expectedPath && urlObj.pathname !== expectedPath) {
    return { ok: false, error: 'Unexpected path', status: 400 };
  }
  const fullPath = urlObj.pathname + urlObj.search;

  // rawBody was stashed by express.json({ verify })
  let rawBody;
  if (req.rawBody instanceof Buffer) {
    rawBody = req.rawBody.toString();
  } else if (typeof req.rawBody === 'string') {
    rawBody = req.rawBody;
  } else {
    rawBody = JSON.stringify(req.body || {});
  }

  const bodyHash = sha256Base16(rawBody);
  const signBase = `${req.method}\n${fullPath}\n${ts}\n${nonce}\n${bodyHash}`;
  console.log('✍️ signBase:', signBase);

  // fetch device record
  const { data: device, error: devErr } = await DB.getDevice(device_id);
  if (devErr || !device) {
    console.warn('🚫 Unknown device:', device_id);
    return { ok: false, error: 'Unknown device', status: 401 };
  }
  console.log('🔑 Device pubkey loaded');

  // insert nonce to prevent replay
  const { error: nonceErr } = await DB.insertNonce(nonce, device_id, parseInt(ts, 10));
  if (nonceErr) {
    console.warn('🚫 Nonce replay or table missing:', nonceErr.message);
    return { ok: false, error: 'Nonce already used or DB missing table', status: 401 };
  }

  // verify signature
  let verified = false;
  try {
    verified = verifyEd25519Signature({
      signBase,
      sigB64: sig_b64,
      pubkeyB64: device.pubkey
    });
  } catch (e) {
    console.error('⚠️ Signature verify threw:', e);
  }
  if (!verified) {
    console.warn('🚫 Signature verification failed');
    return { ok: false, error: 'Signature verification failed', status: 401 };
  }

  console.log('✅ Signed request OK for device:', device_id);
  return { ok: true, device };
}
