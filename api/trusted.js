// Methods:
//  - POST /api/trusted — requires Firebase Auth or deviceId
//  - DELETE /api/trusted?id=123 — requires Firebase Auth or deviceId
import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifyFirebaseIdToken } from '../utils/auth.js';
import { supabase } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // On essaye d'identifier soit via Firebase, soit via deviceId
  let userId = null;
  let deviceId = null;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    const idToken = req.headers.authorization.split(' ')[1];
    const user = await verifyFirebaseIdToken({ headers: { authorization: `Bearer ${idToken}` } });
    if (user) userId = user.uid;
  }

  if (!userId && req.query.device_id) {
    deviceId = req.query.device_id;
  }

  if (!userId && !deviceId) return jsonErr(res, 'Unauthorized', 401);

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

    // Stockage: si userId dispo, on l'utilise, sinon deviceId
    const row = {
      user_id: userId || deviceId,
      label,
      lat,
      lon,
      radius_m: radius,
      created_at: new Date().toISOString()
    };

    const { data: inserted, error } = await supabase.from('trusted_places').insert(row).select().single();
    if (error) return jsonErr(res, 'Insert failed', 500);

    return jsonOk(res, { trusted: inserted });
  }

  if (req.method === 'DELETE') {
    const id = parseInt(new URL(req.url, 'http://localhost').searchParams.get('id') || '0', 10);
    if (!id) return jsonErr(res, 'Missing id');

    // Supprimer seulement si userId ou deviceId correspond
    const { error } = await supabase
      .from('trusted_places')
      .delete()
      .eq('id', id)
      .eq('user_id', userId || deviceId);

    if (error) return jsonErr(res, 'Delete failed', 500);
    return jsonOk(res, {});
  }

  return jsonErr(res, 'Method not allowed', 405);
}
