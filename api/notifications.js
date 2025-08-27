import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifySignedRequest, verifyFirebaseIdToken } from '../utils/auth.js';
import { DB } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    // ----------- ANDROID (GET) -----------
    if (req.method === 'GET') {
      const vr = await verifySignedRequest(req, { expectedPath: '/api/notifications' });
      if (!vr.ok) return jsonErr(res, vr.error, vr.status);

      const device = vr.device;
      if (!device) return jsonErr(res, 'Device not found', 401);

      const { data: notes, error } = await DB.getNotifications(device.user_id);
      if (error) return jsonErr(res, 'DB error', 500);

      return jsonOk(res, { notifications: notes || [] });
    }

    // ----------- WEB (POST) -----------
    if (req.method === 'POST') {
      let body;
      try { body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); }
      catch { return jsonErr(res, 'Invalid JSON'); }

      const user = await verifyFirebaseIdToken(req);
      if (!user) return jsonErr(res, 'Unauthorized', 401);

      const { type, payload, device_id } = body;
      if (!type || !payload) return jsonErr(res, 'Missing type or payload');

      // Insère la notification dans la table pour tous les devices de l'utilisateur
      const { error } = await DB.insertNotification(user.uid, type, payload, device_id || null);
      if (error) return jsonErr(res, 'DB error inserting notification', 500);

      return jsonOk(res, { success: true });
    }

    return jsonErr(res, 'Method not allowed', 405);
  } catch (e) {
    console.error('notifications API error:', e);
    return jsonErr(res, 'Internal server error', 500);
  }
}
