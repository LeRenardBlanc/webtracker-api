import { supabase } from '../utils/db.js';
import { jsonOk, jsonErr, handleCors } from '../utils/response.js';
import { verifyFirebaseIdToken } from '../utils/auth.js';

// POST /api/link-device
// Body: { idToken, code, label? }
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonErr(res, 'Method not allowed', 405);

  // Vérifie le token Firebase
  const user = await verifyFirebaseIdToken(req);
  if (!user) return jsonErr(res, 'Unauthorized', 401);

  // Parse le body JSON
  let body;
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch {
    return jsonErr(res, 'Invalid JSON');
  }

  const code = (body.code || '').trim();
  if (!code) return jsonErr(res, 'Missing code');

  // Cherche le code dans device_links
  const { data: linkData, error: linkErr } = await supabase
    .from('device_links')
    .select('*')
    .eq('code', code)
    .eq('used', false)
    .gte('expires_at', new Date().toISOString())
    .single();

  if (linkErr || !linkData) return jsonErr(res, 'Code invalide ou expiré');

  // Marque le lien comme utilisé
  await supabase.from('device_links').update({ used: true }).eq('id', linkData.id);

  // Récupère l'UUID PostgreSQL de l'utilisateur
  const { data: userData, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('firebase_uid', user.uid)
    .single();

  if (userErr || !userData) return jsonErr(res, 'User not found in DB', 404);

  // Insère le device
  const deviceRow = {
    device_id: linkData.device_id || `dev_${Date.now()}`,
    user_id: userData.id, // UUID valide
    pubkey_b64: linkData.pubkey || null,
    created_at: new Date().toISOString(),
    revoked: false
  };

  const { error: devErr } = await supabase.from('devices').insert(deviceRow);
  if (devErr) {
    console.error('link-device insert device error:', devErr);
    return jsonErr(res, 'DB error when inserting device', 500);
  }

  return jsonOk(res, { device: deviceRow });
}
