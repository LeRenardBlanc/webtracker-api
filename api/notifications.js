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
      if (error) return jsonErr(res, 'DB error fetching notifications', 500);

      // Transform records: map message to payload when payload is missing
      const transformedNotes = (notes || []).map(note => {
        if (!note.payload && note.message) {
          try {
            note.payload = typeof note.message === 'string' ? JSON.parse(note.message) : note.message;
          } catch {
            note.payload = note.message; // fallback to raw message if JSON parsing fails
          }
        }
        // Remove message field from response for cleaner API
        const { message, ...cleanNote } = note;
        return cleanNote;
      });

      return jsonOk(res, { notifications: transformedNotes });
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

      // Insert notification into DB
      const { error: insertErr } = await DB.insertNotification({
        user_id: userUuid,
        device_id: device_id || null,
        type,
        payload
      });
      if (insertErr) {
        console.error('Error inserting notification:', insertErr);
        return jsonErr(res, 'DB error inserting notification', 500);
      }

      return jsonOk(res, { success: true });
    }

    return jsonErr(res, 'Method not allowed', 405);
  } catch (e) {
    console.error('notifications API unexpected error:', e);
    return jsonErr(res, 'Internal server error', 500);
  }
}
