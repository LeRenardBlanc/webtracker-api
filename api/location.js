// Method: POST /api/location — signed by device
// Body: { ts_ms, lat, lon, accuracy_m?, speed_mps?, provider? }
import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifySignedRequest } from '../utils/auth.js';
import { DB } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonErr(res, 'Method not allowed', 405);

  const vr = await verifySignedRequest(req, { expectedPath: '/api/location' });
  if (!vr.ok) return jsonErr(res, vr.error, vr.status);
  const device = vr.device;

  let data;
  try {
    data = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch {
    return jsonErr(res, 'Invalid JSON');
  }

  const ts_ms = parseInt(data.ts_ms, 10);
  const lat = parseFloat(data.lat);
  const lon = parseFloat(data.lon);
  const accuracy = data.accuracy_m != null ? parseFloat(data.accuracy_m) : null;
  const speed = data.speed_mps != null ? parseFloat(data.speed_mps) : null;
  const provider = data.provider || null;

  if (!Number.isFinite(ts_ms) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return jsonErr(res, 'Missing lat/lon/ts_ms');
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return jsonErr(res, 'Invalid coordinates');
  }

  const row = {
    user_id: device.user_id,
    device_id: device.device_id,
    ts_ms,
    lat,
    lon,
    accuracy_m: accuracy,
    speed_mps: speed,
    provider
  };

  const { error } = await DB.insertLocation(row);
  if (error) return jsonErr(res, 'DB insert failed', 500);

  return jsonOk(res, { stored_at: Date.now() });
}
