import { supabase, DB } from '../utils/db.js';
import { jsonOk, jsonErr, handleCors } from '../utils/response.js';
import { verifyFirebaseIdToken } from '../utils/auth.js';

// POST /api/link-device
// Body: { idToken, code, label? }
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonErr(res, 'Method not allowed', 405);

  const user = await verifyFirebaseIdToken(req);
  if (!user) return jsonErr(res, 'Unauthorized', 401);

  let body;
  try { body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch { return jsonErr(res, 'Invalid JSON'); }

  const code = (body.code || '').trim();
  if (!code) return jsonErr(res, 'Missing code');

  const { data: linkData, error } = await supabase
    .from('device_links')
    .select('*')
    .eq('code', code)
    .eq('used', false)
    .gte('expires_at', new Date().toISOString())
    .single();

  if (error || !linkData) return jsonErr(res, 'Code invalide ou expiré');

  // mark used
  await supabase.from('device_links').update({ used: true }).eq('id', linkData.id);

  // Insert device into devices table
  const deviceRow = {
    device_id: linkData.device_id || `dev_${Date.now()}`,
    user_id: user.uid,
    pubkey: linkData.pubkey || null,
    label: body.label || null,
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
