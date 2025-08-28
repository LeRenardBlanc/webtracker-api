import { buffer } from 'micro';
export const config = { api: { bodyParser: false } };

import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifyFirebaseIdToken, verifySignedRequest } from '../utils/auth.js';
import { supabase, DB } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  console.log(`🔔 [trusted] ${req.method} ${req.url}`);

  // Attach rawBody for signature verification on POST and DELETE
  if (req.method === 'POST' || req.method === 'DELETE') {
    const buf = await buffer(req);
    const rawText = buf.toString() || '';
    req.rawBody = rawText;
    try {
      req.body = rawText ? JSON.parse(rawText) : {};
    } catch {
      req.body = {};
    }
  }

  // Authentication
  let userUuid = null;
  let device   = null;

  const fb = await verifyFirebaseIdToken(req);
  if (fb) {
    console.log('➡️ Authenticated via Firebase, uid=', fb.uid);
    const { id, error: uidErr } = await DB.getUserUuidByFirebaseUid(fb.uid);
    if (uidErr) {
      console.error('🚫 DB error fetching user UUID:', uidErr);
      return jsonErr(res, 'DB error', 500);
    }
    userUuid = id;
  } else {
    const vr = await verifySignedRequest(req, { expectedPath: '/api/trusted' });
    if (vr.ok) {
      console.log('➡️ Authenticated via device signature');
      device = vr.device;
    } else {
      console.warn('🚫 Signed auth failed:', vr.error);
    }
  }

  if (!userUuid && !device) {
    console.warn('🚫 Unauthorized call to /api/trusted');
    return jsonErr(res, 'Unauthorized', 401);
  }

  // Determine owners list
  const owners = [];
  if (userUuid) owners.push(userUuid);
  if (device?.user_id) owners.push(device.user_id);
  if (device?.device_id) owners.push(device.device_id);

  if (req.method === 'GET') {
    console.log('🔍 Listing trusted places for owners:', owners);
    const { data, error } = await supabase
      .from('trusted_places')
      .select('id, label, lat, lon, radius_m, created_at')
      .in('user_id', owners.length ? owners : ['__none__'])
      .order('created_at', { ascending: false });
    if (error) {
      console.error('🚫 Select failed:', error);
      return jsonErr(res, 'Select failed', 500);
    }
    return jsonOk(res, { trusted: data || [] });
  }

  if (req.method === 'POST') {
    const body = req.body;
    const lat  = parseFloat(body.lat ?? body.latitude);
    const lon  = parseFloat(body.lon ?? body.longitude);
    const rad  = parseInt(body.radius_m ?? body.radius, 10) || 50;
    const label = body.label ?? null;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return jsonErr(res, 'Missing lat/lon', 400);
    }

    const row = {
      user_id: userUuid || device.user_id,
      label,
      lat,
      lon,
      radius_m: rad,
      created_at: new Date().toISOString()
    };
    console.log('➕ Inserting trusted place:', row);
    const { data: inserted, error } = await supabase
      .from('trusted_places')
      .insert(row)
      .select()
      .single();
    if (error) {
      console.error('🚫 Insert failed:', error);
      return jsonErr(res, 'Insert failed', 500);
    }
    return jsonOk(res, { trusted: inserted });
  }

  if (req.method === 'DELETE') {
    const id = parseInt(new URL(req.url, 'http://localhost').searchParams.get('id') || '0', 10);
    if (!id) return jsonErr(res, 'Missing id', 400);

    console.log('➖ Deleting trusted place id=', id, 'for owners', owners);
    const { error } = await supabase
      .from('trusted_places')
      .delete()
      .eq('id', id)
      .in('user_id', owners.length ? owners : ['__none__']);
    if (error) {
      console.error('🚫 Delete failed:', error);
      return jsonErr(res, 'Delete failed', 500);
    }
    return jsonOk(res);
  }

  return jsonErr(res, 'Method not allowed', 405);
}
