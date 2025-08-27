// Methods:
//  - POST /api/trusted (dashboard) — requires Firebase Auth (Bearer token)
//    body: { label, lat, lon, radius_m? }
//  - DELETE /api/trusted?id=123 (dashboard) — requires Firebase Auth
import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifyFirebaseIdToken } from '../utils/auth.js';
import { supabase } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Vérifier l'utilisateur Firebase
  const firebaseUser = await verifyFirebaseIdToken(req);
  if (!firebaseUser) return jsonErr(res, 'Unauthorized', 401);

  // Récupérer l'UUID correspondant dans la table users
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('firebase_uid', firebaseUser.uid)
    .single();

  if (userErr || !userRow) return jsonErr(res, 'User not found', 404);
  const userId = userRow.id; // UUID à utiliser pour trusted_places

  if (req.method === 'POST') {
    // Récupérer les données du body
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

    // Insertion dans la table trusted_places
    const { data: inserted, error } = await supabase
      .from('trusted_places')
      .insert({
        user_id: userId, // UUID
        label,
        lat,
        lon,
        radius_m: radius
      })
      .select()
      .single();

    if (error) {
      console.error('Insert trusted place error:', error);
      return jsonErr(res, 'Insert failed', 500);
    }

    return jsonOk(res, { trusted: inserted });
  }

  if (req.method === 'DELETE') {
    // Récupérer l'id depuis la query (UUID, pas integer)
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id');
    if (!id) return jsonErr(res, 'Missing id');

    const { error } = await supabase
      .from('trusted_places')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Delete trusted place error:', error);
      return jsonErr(res, 'Delete failed', 500);
    }

    return jsonOk(res, {});
  }

  return jsonErr(res, 'Method not allowed', 405);
}
