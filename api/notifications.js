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
        body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      } catch {
        return jsonErr(res, 'Invalid JSON');
      }

      const user = await verifyFirebaseIdToken(req);
      if (!user) return jsonErr(res, 'Unauthorized', 401);

      const { type, payload: payloadObj } = body;
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
      const payload = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);

      // Get all active devices for this user
      const { data: devices, error: devErr } = await supabase
        .from('devices')
        .select('device_id')
        .eq('user_id', userUuid)
        .eq('revoked', false);

      if (devErr) {
        console.error('Error fetching devices:', devErr);
        return jsonErr(res, 'Failed to fetch devices', 500);
      }

      if (!devices || devices.length === 0) {
        return jsonErr(res, 'No active devices found for user', 404);
      }

      // Insert notification for each device
      let successCount = 0;
      for (const device of devices) {
        try {
          const { error: insertErr } = await supabase
            .from('notifications')
            .insert({
              user_id: userUuid,
              device_id: device.device_id,
              type,
              payload
            });

          if (!insertErr) {
            successCount++;
          } else {
            console.warn(`⚠️ Failed to insert notification for device ${device.device_id}:`, insertErr);
          }
        } catch (err) {
          console.error(`Error inserting notification for device ${device.device_id}:`, err);
        }
      }

      console.log(`📱 Broadcast notification to ${successCount}/${devices.length} devices`);

      if (successCount === 0) {
        return jsonErr(res, 'Failed to send notification to any devices', 500);
      }

      return jsonOk(res);
    }

    return jsonErr(res, 'Method not allowed', 405);

  } catch (err) {
    console.error('🚫 notifications API error:', err);
    return jsonErr(res, 'Internal server error', 500);
  }
}
