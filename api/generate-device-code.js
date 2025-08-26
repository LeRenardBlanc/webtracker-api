import { randomUUID } from 'crypto';
import { supabase } from '../utils/db.js';
import { jsonOk, jsonErr, handleCors } from '../utils/response.js';

// POST /api/generate-device-code
// Body: { device_id, pubkey? }
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonErr(res, 'Method not allowed', 405);

  let body;
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch {
    return jsonErr(res, 'Invalid JSON');
  }

  const device_id = body.device_id || null;
  const pubkey = body.pubkey || null;

  if (!device_id || !/^[-A-Za-z0-9_]{4,128}$/.test(device_id)) {
    return jsonErr(res, 'Missing or invalid device_id');
  }

  const code = randomUUID().slice(0, 8);
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  const { error } = await supabase.from('device_links').insert({ device_id, pubkey, code, expires_at, used: false });
  if (error) {
    console.error('generate-device-code supabase error:', error);
    return jsonErr(res, 'DB error', 500);
  }

  return jsonOk(res, { code, expires_at });
}
