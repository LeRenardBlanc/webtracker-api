import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifySignedRequest, verifyFirebaseIdToken } from '../utils/auth.js';
import { DB, supabase } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  console.log(`🔔 [notifications] ${req.method} ${req.url}`);

  try {
    // ----------- ANDROID (GET) -----------
    if (req.method === 'GET') {
      const vr = await verifySignedRequest(req, { expectedPath: '/api/notifications' });
      if (!vr.ok) return jsonErr(res, vr.error, vr.status);

      const device = vr.device;
      if (!device) return jsonErr(res, 'Device not found', 401);

      const { data: notes, error } = await DB.getNotifications(device.device_id);
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

      // Helper to insert a single notification
      const tryInsert = async (dId) => {
        try {
          const { error: insertErr } = await DB.insertNotification({
            user_id: userUuid,
            device_id: dId,
            type,
            payload
          });
          
          if (insertErr) {
            // Foreign key error means device doesn't exist
            if (insertErr.code === '23503') {
              console.log(`⚠️ Skipping notification for missing device ${dId}`);
              return false;
            }
            throw insertErr;
          }
          return true;
        } catch (e) {
          console.error('❌ Error inserting notification:', e);
          throw e;
        }
      };

      // Check if targeting specific device or broadcasting
      if (device_id) {
        const success = await tryInsert(device_id);
        if (!success) {
          return jsonErr(res, `Device ${device_id} not found`, 404);
        }
      } else {
        // Broadcast to all active devices for this user
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

        let insertedCount = 0;
        for (const d of devices) {
          const success = await tryInsert(d.device_id);
          if (success) insertedCount++;
        }

        console.log(`📱 Broadcast notification to ${insertedCount}/${devices.length} devices`);
        if (insertedCount === 0) {
          return jsonErr(res, 'No active devices found', 404);
        }
      }

      return jsonOk(res, { success: true });
    }

    return jsonErr(res, 'Method not allowed', 405);
  } catch (e) {
    console.error('🚫 notifications API unexpected error:', e);
    return jsonErr(res, 'Internal server error', 500);
  }
}
