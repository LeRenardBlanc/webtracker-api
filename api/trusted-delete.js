// POST /api/trusted/delete — Android compatibility endpoint (signed or Firebase)
import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifyFirebaseIdToken, verifySignedRequest } from '../utils/auth.js';
import { supabase, DB } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonErr(res, 'Method not allowed', 405);

  // Identify caller (Firebase or signed)
  let userUuid = null;
  let device = null;

  const fb = await verifyFirebaseIdToken(req);
  if (fb) {
    const { id } = await DB.getUserUuidByFirebaseUid(fb.uid);
    userUuid = id;
  } else {
    const vr = await verifySignedRequest(req, { expectedPath: '/api/trusted/delete' });
    if (vr.ok) device = vr.device;
  }
  if (!userUuid && !device) return jsonErr(res, 'Unauthorized', 401);

  let body;
  try { body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
  catch { return jsonErr(res, 'Invalid JSON'); }

  const id = parseInt(body.id || '0', 10);
  if (!id) return jsonErr(res, 'Missing id');

  const ownerCandidates = [];
  if (userUuid) ownerCandidates.push(userUuid);
  if (device) {
    if (device.user_id) ownerCandidates.push(device.user_id);
    if (device.device_id) ownerCandidates.push(device.device_id); // legacy safety
  }

  const { error } = await supabase
    .from('trusted_places')
    .delete()
    .eq('id', id)
    .in('user_id', ownerCandidates.length ? ownerCandidates : ['__none__']);

  if (error) return jsonErr(res, 'Delete failed', 500);
  return jsonOk(res, {});
}
