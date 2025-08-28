import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export default supabase;

// Helpers for common queries (tables must exist in Supabase)
export const DB = {
  async getDevice(device_id) {
    return await supabase
      .from('devices')
      .select('*')
      .eq('device_id', device_id)
      .eq('revoked', false)
      .single();
  },

  async insertNonce(nonce, device_id, ts) {
    // Table nonces has a unique constraint on (nonce, device_id)
    return await supabase.from('nonces').insert({ nonce, device_id, ts });
  },

  async insertLocation(row) {
    return await supabase.from('locations').insert(row);
  },

  // CORRECTION: La fonction getNotifications est mise à jour pour le nouveau schéma.
  // Elle sélectionne maintenant les notifications pour un utilisateur donné.
  async getNotifications(user_id) {
    return await supabase
      .from('notifications')
      .select('id, user_id, created_at') // Seules les colonnes existantes sont sélectionnées
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });
  },

  async addTrusted(row) {
    return await supabase
      .from('trusted_locations')
      .insert(row)
      .select('*')
      .single();
  },

  async deleteTrusted(user_id, id) {
    return await supabase
      .from('trusted_locations')
      .delete()
      .eq('user_id', user_id)
      .eq('id', id);
  },

  async listLocations(user_id, from_ms, to_ms) {
    let q = supabase
      .from('locations')
      .select('lat, lon, ts_ms')
      .eq('user_id', user_id);

    if (from_ms) q = q.gte('ts_ms', from_ms);
    if (to_ms) q = q.lte('ts_ms', to_ms);

    return await q.order('ts_ms', { ascending: true });
  },

  // CORRECTION: Cette fonction est mise à jour pour correspondre au schéma simple.
  async insertNotification({ user_id }) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert({ user_id }) // Seul user_id est inséré
        .select();
      return { data, error };
    } catch (err) {
      return { data: null, error: err };
    }
  },

  async getUserUuidByFirebaseUid(firebase_uid) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', firebase_uid)
      .single();
    return { id: data?.id || null, error };
  },
};
