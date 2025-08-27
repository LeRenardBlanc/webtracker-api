import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifySignedRequest } from '../utils/auth.js';
import { DB } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return jsonErr(res, 'Method not allowed', 405);

  // Vérifier signature deviceId (comme pour trusted/device)
  const vr = await verifySignedRequest(req, { expectedPath: '/api/notifications' });
  if (!vr.ok) return jsonErr(res, vr.error, vr.status);

  const device = vr.device;
  if (!device) return jsonErr(res, 'Device not found', 401);

  const { data: notes, error } = await DB.getNotifications(device.user_id);
  if (error) return jsonErr(res, 'DB error', 500);

  return jsonOk(res, { notifications: notes || [] });
}
