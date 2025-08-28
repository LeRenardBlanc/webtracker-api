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

      // Check if targeting specific device or broadcasting
      if (device_id) {
        // Single device: First verify the device exists and belongs to this user
        const { data: device, error: devErr } = await supabase
          .from('devices')
          .select('device_id')
          .eq('device_id', device_id)
          .eq('user_id', userUuid)
          .eq('revoked', false)
          .single();

        if (devErr || !device) {
          console.warn(`⚠️ Device ${device_id} not found or not owned by user`);
          return jsonErr(res, `Device not found or unauthorized`, 404);
        }

        // Now insert the notification
        const { error: insertErr } = await DB.insertNotification({
          user_id: userUuid,
          device_id,
          type,
          payload
        });

        if (insertErr) {
          console.error('❌ Error inserting notification:', insertErr);
          return jsonErr(res, 'Failed to insert notification', 500);
        }

        console.log(`📱 Notification sent to device ${device_id}`);
        return jsonOk(res);

      } else {
        // Broadcast: Get all active devices for this user
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
          return jsonErr(res, 'No active devices found for user', 404);
        }

        // Insert notification for each device
        let successCount = 0;
        for (const device of devices) {
          const { error: insertErr } = await DB.insertNotification({
            user_id: userUuid,
            device_id: device.device_id,
            type,
            payload
          });
          
          if (insertErr) {
            console.warn(`⚠️ Failed to send notification to device ${device.device_id}:`, insertErr);
          } else {
            successCount++;
          }
        }

        console.log(`📱 Broadcast notification to ${successCount}/${devices.length} devices`);
        
        if (successCount === 0) {
          return jsonErr(res, 'Failed to send notifications to any device', 500);
        }

        return jsonOk(res);
      }
    }

    return jsonErr(res, 'Method not allowed', 405);
  } catch (e) {
    console.error('🚫 notifications API unexpected error:', e);
    return jsonErr(res, 'Internal server error', 500);
  }
}
