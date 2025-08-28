// Methods:
//  - GET /api/trusted — list for user (Firebase) or device (signed)
//  - POST /api/trusted — add (Firebase or signed)
//  - DELETE /api/trusted?id=123 — delete (Firebase or signed)
import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifyFirebaseIdToken, verifySignedRequest } from '../utils/auth.js';
import { supabase, DB } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Identify caller
  let userUuid = null;
  let device = null;

  const fb = await verifyFirebaseIdToken(req);
  if (fb) {
    const { id } = await DB.getUserUuidByFirebaseUid(fb.uid);
    userUuid = id;
  } else {
    const vr = await verifySignedRequest(req, { expectedPath: '/api/trusted' });
    if (vr.ok) device = vr.device;
  }
  if (!userUuid && !device) return jsonErr(res, 'Unauthorized', 401);

  // Build allowed owner ids (support legacy rows written with device_id)
  const ownerCandidates = [];
  if (userUuid) ownerCandidates.push(userUuid);
  if (device) {
    if (device.user_id) ownerCandidates.push(device.user_id);
    if (device.device_id) ownerCandidates.push(device.device_id); // legacy
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('trusted_places')
      .select('id, label, lat, lon, radius_m, created_at')
      .in('user_id', ownerCandidates.length ? ownerCandidates : ['__none__'])
      .order('created_at', { ascending: false });
    if (error) return jsonErr(res, 'Select failed', 500);
    return jsonOk(res, { trusted: data || [] });
  }

  if (req.method === 'POST') {
    let data;
    try {
      data = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch {
      return jsonErr(res, 'Invalid JSON');
    }

    const label = data.label || null;
    // Accept both {lat,lon,radius_m} and {latitude,longitude,radius}
    const lat = parseFloat(data.lat ?? data.latitude);
    const lon = parseFloat(data.lon ?? data.longitude);
    const radius = data.radius_m != null ? parseInt(data.radius_m, 10)
      : (data.radius != null ? parseInt(data.radius, 10) : 50);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return jsonErr(res, 'Missing lat/lon');

    const row = {
      user_id: userUuid || device.user_id,
      label,
      lat,
      lon,
      radius_m: Number.isFinite(radius) ? radius : 50,
      created_at: new Date().toISOString()
    };

    const { data: inserted, error } = await supabase.from('trusted_places').insert(row).select().single();
    if (error) return jsonErr(res, 'Insert failed', 500);

    return jsonOk(res, { trusted: inserted });
  }

  if (req.method === 'DELETE') {
    const id = parseInt(new URL(req.url, 'http://localhost').searchParams.get('id') || '0', 10);
    if (!id) return jsonErr(res, 'Missing id');

    const { error } = await supabase
      .from('trusted_places')
      .delete()
      .eq('id', id)
      .in('user_id', ownerCandidates.length ? ownerCandidates : ['__none__']);

    if (error) return jsonErr(res, 'Delete failed', 500);
    return jsonOk(res, {});
  }

  return jsonErr(res, 'Method not allowed', 405);
}
