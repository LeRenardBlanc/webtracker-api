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

  const now = Math.floor(Date.now() / 1000);
  const skew = parseInt(process.env.TIME_SKEW_SEC || '300', 10);
  if (Math.abs(now - parseInt(ts, 10)) > skew) {
    return { ok: false, error: 'Timestamp out of range', status: 401 };
  }

  const method = req.method;
  const urlObj = new URL(req.url, 'http://localhost');
  const fullPath = urlObj.pathname + urlObj.search;
  if (expectedPath && urlObj.pathname !== expectedPath) {
    return { ok: false, error: 'Bad request path', status: 400 };
  }

  // ← use the raw body buffer that express.json saved for us, falling back to stringify
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

  // fetch device, check nonce, verify signature…
  const { data: device, error: devErr } = await DB.getDevice(device_id);
  if (devErr || !device) {
    return { ok: false, error: 'Unknown device', status: 401 };
  }
  const { error: nonceErr } = await DB.insertNonce(nonce, device_id, parseInt(ts, 10));
  if (nonceErr) {
    return { ok: false, error: 'Nonce already used', status: 401 };
  }

  let verified = false;
  try {
    verified = verifyEd25519Signature({
      signBase,
      sigB64: sig_b64,
      pubkeyB64: device.pubkey
    });
  } catch (e) {
    // swallow
  }
  if (!verified) {
    return { ok: false, error: 'Signature verification failed', status: 401 };
  }
  return { ok: true, device };
}
