// Methods:
//  - POST /api/trusted (dashboard) — requires Firebase Auth (Bearer token)
//    body: { label, lat, lon, radius_m? }
//  - DELETE /api/trusted?id=123 (dashboard) — requires Firebase Auth
import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifyFirebaseIdToken } from '../utils/auth.js';
import { DB } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await verifyFirebaseIdToken(req);
  if (!user) return jsonErr(res, 'Unauthorized', 401);

  if (req.method === 'POST') {
    let data;
    try {
      data = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch {
      return jsonErr(res, 'Invalid JSON');
    }
    const label = data.label || null;
    const lat = parseFloat(data.lat);
    const lon = parseFloat(data.lon);
    const radius = data.radius_m != null ? parseInt(data.radius_m, 10) : 50;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return jsonErr(res, 'Missing lat/lon');

    const { data: inserted, error } = await DB.addTrusted({
      user_id: user.uid, // store uid in user_id column (text)
      label,
      lat,
      lon,
      radius_m: radius
    });
    if (error) return jsonErr(res, 'Insert failed', 500);
    return jsonOk(res, { trusted: inserted });
  }

  if (req.method === 'DELETE') {
    const id = parseInt(new URL(req.url, 'http://localhost').searchParams.get('id') || '0', 10);
    if (!id) return jsonErr(res, 'Missing id');
    const { error } = await DB.deleteTrusted(user.uid, id);
    if (error) return jsonErr(res, 'Delete failed', 500);
    return jsonOk(res, {});
  }

  return jsonErr(res, 'Method not allowed', 405);
}
