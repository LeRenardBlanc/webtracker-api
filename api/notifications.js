import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifySignedRequest, verifyFirebaseIdToken } from '../utils/auth.js';
import { DB } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  console.log(`🔔 [notifications] ${req.method} ${req.url}`);

  try {
    // --- ANDROID (GET) : L'appareil Android récupère ses notifications ---
    if (req.method === 'GET') {
      const vr = await verifySignedRequest(req, { expectedPath: '/api/notifications' });
      if (!vr.ok) return jsonErr(res, vr.error, vr.status);

      const device = vr.device;
      if (!device) return jsonErr(res, 'Device not found', 401);

      const { data: notes, error } = await DB.getNotificationsForDevice(device.device_id);
      if (error) {
        console.error('DB error fetching notifications for device:', error);
        return jsonErr(res, 'DB error', 500);
      }

      // Marquer les notifications comme lues après les avoir envoyées
      if (notes && notes.length > 0) {
        const idsToMark = notes.map(n => n.id);
        await DB.markNotificationsAsRead(idsToMark);
      }

      return jsonOk(res, { notifications: notes || [] });
    }

    // --- WEB (POST) : Le site web envoie une notification à tous les appareils de l'utilisateur ---
    if (req.method === 'POST') {
      const user = await verifyFirebaseIdToken(req);
      if (!user) return jsonErr(res, 'Unauthorized', 401);

      let body;
      try {
        body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      } catch {
        return jsonErr(res, 'Invalid JSON');
      }

      const { type, payload } = body;
      if (!type) {
        return jsonErr(res, 'Missing notification type');
      }

      const { id: userUuid, error: uuidErr } = await DB.getUserUuidByFirebaseUid(user.uid);
      if (uuidErr || !userUuid) {
        return jsonErr(res, 'User not found in DB', 404);
      }

      // Récupérer tous les appareils actifs de l'utilisateur
      const { data: devices, error: devErr } = await DB.getDevicesForUser(userUuid);
      if (devErr || !devices || devices.length === 0) {
        return jsonErr(res, 'No active devices found for user', 404);
      }

      // Créer une notification pour chaque appareil
      const notificationsToInsert = devices.map(device => ({
        user_id: userUuid,
        device_id: device.device_id,
        type,
        payload: payload || {}
      }));

      const { error: insertErr } = await DB.insertNotifications(notificationsToInsert);

      if (insertErr) {
        console.error('❌ Erreur insertion notifications:', insertErr);
        return jsonErr(res, 'Failed to insert notifications', 500);
      }

      console.log(`📱 Notification de type [${type}] envoyée à ${devices.length} appareil(s) pour user_id: ${userUuid}`);
      return jsonOk(res, { message: `Notification sent to ${devices.length} device(s).` });
    }

    return jsonErr(res, 'Method not allowed', 405);

  } catch (err) {
    console.error('🚫 notifications API error:', err);
    return jsonErr(res, 'Internal server error', 500);
  }
}
