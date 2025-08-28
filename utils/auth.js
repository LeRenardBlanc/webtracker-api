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

  const now = Math.floor(Date.now() / 1000);
  const skew = parseInt(process.env.TIME_SKEW_SEC || '300', 10);
  if (Math.abs(now - parseInt(ts, 10)) > skew) {
    console.error('🐛 Timestamp out of range:', { now, ts, skew });
    return { ok: false, error: 'Timestamp out of range', status: 401 };
  }

  const method = req.method;
  const path = new URL(req.url, 'http://localhost').pathname;
  const rawBody = typeof req.body === 'string'
    ? req.body
    : JSON.stringify(req.body || {});
  const bodyHash = sha256Base16(rawBody);
  const signBase = `${method}\n${path}\n${ts}\n${nonce}\n${bodyHash}`;

  console.log('🐛 Computed signBase:', signBase);

  // Fetch device public key
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

  // Insert nonce (unique constraint prevents replay)
  const { error: nonceErr } = await DB.insertNonce(nonce, device_id, parseInt(ts, 10));
  if (nonceErr) {
    console.error('🐛 Nonce already used:', nonceErr);
    return { ok: false, error: 'Nonce already used', status: 401 };
  }

  // Verify signature (guard against exceptions)
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
