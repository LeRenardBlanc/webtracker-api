import admin from 'firebase-admin';
import { supabase } from '../utils/db.js';
import { jsonOk, jsonErr, handleCors } from '../utils/response.js';
import { verifyFirebaseIdToken } from '../utils/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return jsonErr(res, 'Method not allowed', 405);

  try {
    const { idToken, email } = req.body;
    if (!idToken) return jsonErr(res, 'idToken missing');

    const decoded = await verifyFirebaseIdToken(req);
    if (!decoded) return jsonErr(res, 'Invalid or expired token', 401);
    
    const uid = decoded.uid;

    // Align upsert with actual DB schema:
    // - table `users` uses `firebase_uid` (text) and `phone_number` (text).
    // - primary key is `id` (uuid) so we upsert on the unique `firebase_uid`.
    // Select explicit columns to avoid PostgREST schema cache issues.
    const { data, error } = await supabase
      .from('users')
      .upsert(
        {
          firebase_uid: uid,
          email: email || decoded.email || null,
          phone_number: decoded.phone_number || null
        },
        { onConflict: 'firebase_uid' }
      )
      .select('id, firebase_uid, email, phone_number, created_at')
      .single();

    if (error) {
      console.error('Supabase upsert error:', error);
      return jsonErr(res, 'Supabase error', 500);
    }

    return jsonOk(res, { user: data });
  } catch (err) {
    console.error('register-supabase error:', err);
    return jsonErr(res, err?.message || 'server error', 500);
  }
}
