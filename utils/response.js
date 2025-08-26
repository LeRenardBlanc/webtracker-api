export function jsonOk(res, data = {}, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, ...data }));
}

export function jsonErr(res, message, status = 400) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: message }));
}

export function handleCors(req, res, { allowOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000' , allowMethods = 'GET,POST,DELETE,OPTIONS' } = {}) {
  // Restrict CORS by default to the frontend origin; set ALLOWED_ORIGIN in backend env for production
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', allowMethods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id, X-Ts, X-Nonce, X-Sig');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}
