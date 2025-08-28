import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifySignedRequest, verifyFirebaseIdToken } from '../utils/auth.js';
import { DB, supabase } from '../utils/db.js';

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
      if (error) return jsonErr(res, 'DB error fetching notifications', 500);

      return jsonOk(res, { notifications: notes || [] });
    }

    // ----------- WEB (POST) -----------
    if (req.method === 'POST') {
      let body;
      try {
        body = typeof req.body === 'object'
          ? req.body
          : JSON.parse(req.body || '{}');
      } catch {
        return jsonErr(res, 'Invalid JSON');
      }

      // Authenticate via Firebase
      const user = await verifyFirebaseIdToken(req);
      if (!user) return jsonErr(res, 'Unauthorized', 401);

      const { type, payload: payloadObj, device_id } = body;
      if (!type || payloadObj == null) {
        return jsonErr(res, 'Missing type or payload');
      }

      // Map Firebase uid -> Supabase UUID
      const { id: userUuid, error: uuidErr } = await DB.getUserUuidByFirebaseUid(user.uid);
      if (uuidErr) {
        console.error('Error looking up user UUID:', uuidErr);
        return jsonErr(res, 'DB error', 500);
      }
      if (!userUuid) {
        return jsonErr(res, 'User not found in DB', 404);
      }

      // Ensure payload is a JSON string
      const payload = typeof payloadObj === 'string'
        ? payloadObj
        : JSON.stringify(payloadObj);

      // Helper to insert a single notification, skipping missing devices
      const tryInsert = async (dId) => {
        const { error: insertErr } = await DB.insertNotification({
          user_id: userUuid,
          device_id: dId,
          type,
          payload
        });
        if (insertErr) {
          // Foreign key error: device not present
          if (insertErr.code === '23503') {
            console.warn(`Skipping notification for missing device ${dId}`);
            return;
          }
          throw insertErr;
        }
      };

      if (device_id) {
        // Send to specific device
        try {
          await tryInsert(device_id);
        } catch (e) {
          console.error('Error inserting notification:', e);
          return jsonErr(res, 'DB error inserting notification', 500);
        }
      } else {
        // Broadcast to all non-revoked devices for this user
        const { data: devices, error: devErr } = await supabase
          .from('devices')
          .select('device_id')
          .eq('user_id', userUuid)
          .eq('revoked', false);
        if (devErr) {
          console.error('Error fetching devices for broadcast:', devErr);
          return jsonErr(res, 'DB error fetching devices', 500);
        }
        if (!devices || devices.length === 0) {
          return jsonErr(res, 'No devices found for user', 404);
        }
        for (const d of devices) {
          try {
            await tryInsert(d.device_id);
          } catch (e) {
            console.error('Error inserting broadcast notification for device', d.device_id, e);
            return jsonErr(res, 'DB error inserting notification', 500);
          }
        }
      }

      return jsonOk(res, { success: true });
    }

    return jsonErr(res, 'Method not allowed', 405);
  } catch (e) {
    console.error('notifications API unexpected error:', e);
    return jsonErr(res, 'Internal server error', 500);
  }
}
